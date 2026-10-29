import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { checkLimitStrict, resetLimit } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/members/account-admin";
import { getOrCreateFamilyPin } from "@/lib/auth/family-pin";
import { constantTimeEqual, derivePinPassword, memberEmail } from "@/lib/auth/pin-crypto";
import { accountLockKey, remainingDelayMs } from "@/lib/auth/pin-lockout";
import { checkJoinName, firstNameKey, resolvePinCandidates, type PinCandidate } from "@/lib/auth/pin-resolve";
import { issueJoinTicket, verifyJoinTicket } from "@/lib/auth/join-ticket";
import {
  clearDeviceCookie,
  lookupRememberedDevice,
  rememberDevice,
  revokeDevices,
  touchDevice,
} from "@/lib/auth/pin-device-store";
import {
  changePinSchema,
  firstIssueCode,
  familyPinSchema,
  isDuplicateIdentityError,
  makeNameKey,
  normaliseName,
  pinJoinSchema,
  pinNameSchema,
  pinMessage,
  pinSchema,
  pinSignInSchema,
  type ChangePinInput,
  type Lang,
  type PinJoinInput,
  type PinMessageCode,
  type PinSignInInput,
} from "@/lib/auth/pin-validation";

// PIN sign-in, join and change. Server-only: uses the service-role key.
//
// Rules this file keeps:
//  * a PIN is never logged, stored, put in a URL, an error or an audit entry;
//  * a wrong name, wrong birthday and wrong PIN all produce the SAME generic
//    message, after a roughly constant delay, and failed tries are counted for
//    names that do not exist too;
//  * if the rate limiter (Upstash) is down we refuse PIN attempts (fail closed).

export type PinResult = { ok: true; redirectTo: string } | { ok: false; code: PinMessageCode; error: string };

const fail = (code: PinMessageCode, lang: Lang): PinResult => ({ ok: false, code, error: pinMessage(code, lang) });

/** Used when no account matches, so the work done is the same either way. */
const DUMMY_ID = "00000000-0000-4000-8000-000000000000";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function padTo(startedAt: number) {
  const wait = remainingDelayMs(startedAt, Date.now());
  if (wait > 0) await sleep(wait);
}

type PinProfile = { id: string };

/** The Redis identifier of one signed-in user's "current PIN" tries (Change my PIN). */
export function pinUserLockId(userId: string): string {
  return sha(`user:${userId}`);
}

/**
 * The Redis identifier of one PIN account's lockout counters (never the raw name
 * or birthday). An account that joined without a birthday uses an empty one.
 */
export function pinAccountLockId(nameKey: string, dateOfBirth: string | null): string {
  return sha(accountLockKey(nameKey, dateOfBirth ?? ""));
}

type AttemptGate =
  | { ok: true; lastShort: boolean; lastDay: boolean }
  | { ok: false; code: "busy" | "locked" | "locked_day" };

/**
 * Take one try from an account's 15-minute and 24-hour budgets BEFORE the
 * attempt is made. Upstash's limit() is atomic, so parallel requests (from
 * one IP or many) cannot all read "5 left" and slip past the lock; a correct
 * PIN resets both budgets afterwards.
 */
async function takeAttempt(lockId: string): Promise<AttemptGate> {
  const short = await checkLimitStrict("pinFail", lockId);
  if (short.unavailable) return { ok: false, code: "busy" };
  if (!short.success) return { ok: false, code: "locked" };
  const day = await checkLimitStrict("pinFailDay", lockId);
  if (day.unavailable) return { ok: false, code: "busy" };
  if (!day.success) return { ok: false, code: "locked_day" };
  return { ok: true, lastShort: short.remaining <= 0, lastDay: day.remaining <= 0 };
}

/** Forget an account's failed tries (correct PIN, or an admin reset it). Best effort. */
export async function clearPinLockout(lockId: string): Promise<void> {
  await Promise.all([resetLimit("pinFail", lockId), resetLimit("pinFailDay", lockId)]);
}

/** Supabase refused for a reason that is not "wrong password" (its own rate limit, an outage). */
const notACredentialError = (status: number | undefined) => (status ?? 0) === 429 || (status ?? 0) >= 500;

async function findPinProfile(nameKey: string, dateOfBirth: string): Promise<PinProfile | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("profiles")
    .select("id")
    .eq("name_key", nameKey)
    .eq("date_of_birth", dateOfBirth)
    .eq("login_method", "pin")
    .maybeSingle();
  return (data as PinProfile | null) ?? null;
}

// ── sign in ──────────────────────────────────────────────────────────────────

export async function signInWithPin(raw: PinSignInInput, lang: Lang): Promise<PinResult> {
  const startedAt = Date.now();
  const parsed = pinSignInSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueCode(parsed.error), lang);
  const { firstName, lastName, dateOfBirth, pin } = parsed.data;
  const secret = env().SUPABASE_SERVICE_ROLE_KEY;

  // 1. Per IP: 20 attempts / 15 minutes.
  const ip = await clientIp();
  const ipCheck = await checkLimitStrict("pinIp", sha(`ip:${ip}`));
  if (ipCheck.unavailable) return fail("busy", lang);
  if (!ipCheck.success) return fail("too_many_ip", lang);

  // New-device sign-in by first name (+ optional last name / birthday).
  if (!lastName || !dateOfBirth) {
    return signInByFirstName({ firstName, lastName, dateOfBirth, pin, startedAt, lang, secret });
  }

  // 2. Per account, keyed on the normalised name + birthday (the same key the
  // account is looked up by): 5 tries / 15 minutes and 10 tries / 24 hours.
  // Counted for names that do not exist too, so a lock reveals nothing.
  const nameKey = makeNameKey(firstName, lastName);
  const lockId = pinAccountLockId(nameKey, dateOfBirth);
  const gate = await takeAttempt(lockId);
  if (!gate.ok) {
    await padTo(startedAt);
    return fail(gate.code, lang);
  }

  // 3 + 4. Look the account up and try the derived password.
  const profile = await findPinProfile(nameKey, dateOfBirth);
  const result = await attemptPinSignIn({ profile, lockId, gate, pin, startedAt, lang, secret });
  if (result.ok && profile) await rememberDevice(profile.id);
  return result;
}

/** Every PIN account's identity (a few hundred rows at most). Null when the database could not be read. */
async function listPinCandidates(): Promise<PinCandidate[] | null> {
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("id, first_name, name_key, date_of_birth")
    .eq("login_method", "pin");
  if (error) {
    console.error("[pin] could not list PIN accounts:", error.message);
    return null;
  }
  return (data ?? []) as PinCandidate[];
}

/**
 * Per normalised first name: 20 tries / 15 minutes and 50 / day, taken BEFORE
 * the account is resolved. Fail closed. Not reset by a correct PIN.
 */
async function takeFirstNameAttempt(fkey: string): Promise<{ ok: true } | { ok: false; code: "busy" | "locked" | "locked_day" }> {
  const id = sha(`first:${fkey}`);
  const short = await checkLimitStrict("pinFirst", id);
  if (short.unavailable) return { ok: false, code: "busy" };
  if (!short.success) return { ok: false, code: "locked" };
  const day = await checkLimitStrict("pinFirstDay", id);
  if (day.unavailable) return { ok: false, code: "busy" };
  if (!day.success) return { ok: false, code: "locked_day" };
  return { ok: true };
}

/**
 * First name + PIN (the birthday and last name are asked for only when needed).
 *  * 0 matches: the usual dummy attempt, then the generic message;
 *  * 1 match: attempt it, under that account's shared lockout;
 *  * 2+ matches: need_birthday (or need_last_name when the birthday is also shared),
 *    WITHOUT trying any PIN and without touching an account lockout. These still
 *    count against the first-name and IP limiters and take the usual response time.
 * A birthday given for a unique name must match too, otherwise it is a mismatch.
 */
async function signInByFirstName(args: {
  firstName: string;
  lastName?: string;
  dateOfBirth?: string;
  pin: string;
  startedAt: number;
  lang: Lang;
  secret: string;
}): Promise<PinResult> {
  const { firstName, lastName, dateOfBirth, pin, startedAt, lang, secret } = args;
  const fkey = firstNameKey(firstName);

  const firstGate = await takeFirstNameAttempt(fkey);
  if (!firstGate.ok) {
    await padTo(startedAt);
    return fail(firstGate.code, lang);
  }

  const candidates = await listPinCandidates();
  if (!candidates) {
    await padTo(startedAt);
    return fail("busy", lang);
  }

  const resolution = resolvePinCandidates(candidates, { firstName, lastName, dateOfBirth });
  if (resolution.kind === "need_birthday" || resolution.kind === "need_last_name") {
    await padTo(startedAt);
    return fail(resolution.kind, lang);
  }

  const profile = resolution.kind === "one" ? { id: resolution.profile.id } : null;
  // A real account shares its lockout with every other form. No account (or a
  // mismatched birthday) is counted against a bucket of its own, so a lock reveals nothing.
  const lockId =
    resolution.kind === "one"
      ? pinAccountLockId(resolution.profile.name_key, resolution.profile.date_of_birth)
      : pinAccountLockId(`first:${fkey}`, dateOfBirth ?? "");
  const gate = await takeAttempt(lockId);
  if (!gate.ok) {
    await padTo(startedAt);
    return fail(gate.code, lang);
  }

  const result = await attemptPinSignIn({ profile, lockId, gate, pin, startedAt, lang, secret });
  if (result.ok && profile) {
    await rememberDevice(profile.id);
    // Reached through the "no birthday" fallback: keep the birthday they just
    // gave (proven by the PIN), so from now on that first name is matched on
    // exact birthdays only and a namesake's typo can never reach this account.
    if (resolution.kind === "one" && !resolution.profile.date_of_birth && dateOfBirth) {
      await saveFallbackBirthday(resolution.profile, dateOfBirth);
    }
  }
  return result;
}

/** Best effort: skipped if another account already has this name + birthday. */
async function saveFallbackBirthday(profile: { id: string; name_key: string }, dateOfBirth: string): Promise<void> {
  const { error } = await createServiceClient()
    .from("profiles")
    .update({ date_of_birth: dateOfBirth })
    .eq("id", profile.id)
    .is("date_of_birth", null);
  if (error) {
    if (!isDuplicateIdentityError(error)) console.error("[pin-signin] could not save the birthday:", error.message);
    return;
  }
  // Its lockout key moves from (name, no birthday) to (name, birthday).
  await clearPinLockout(pinAccountLockId(profile.name_key, null));
  await writeAudit({ actorId: profile.id, rowId: profile.id, operation: "update", before: null, after: { event: "pin_birthday_added" } });
}

/**
 * The attempt itself, shared by the full form (name + birthday + PIN) and the
 * remembered-device form (PIN only): both take their try from the SAME account
 * counters (`lockId`) before this runs, so neither path is a way around the other's lock.
 *
 * With no account we still run a sign-in against a placeholder address so the work
 * done is the same either way.
 */
async function attemptPinSignIn(args: {
  profile: PinProfile | null;
  lockId: string;
  gate: Extract<AttemptGate, { ok: true }>;
  pin: string;
  startedAt: number;
  lang: Lang;
  secret: string;
}): Promise<PinResult> {
  const { profile, lockId, gate, pin, startedAt, lang, secret } = args;
  const userId = profile?.id ?? DUMMY_ID;
  let email = memberEmail(DUMMY_ID);
  if (profile) {
    const { data } = await createServiceClient().auth.admin.getUserById(profile.id);
    if (data.user?.email) email = data.user.email;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: derivePinPassword(userId, pin, secret),
  });

  if (!error && profile) {
    await clearPinLockout(lockId);
    await padTo(startedAt);
    return { ok: true, redirectTo: "/" };
  }

  // Failure (already counted). The day's last try on a real account
  // is recorded for the admins: someone may be guessing that member's PIN.
  if (profile && gate.lastDay && !notACredentialError(error?.status)) {
    await writeAudit({
      actorId: profile.id,
      rowId: profile.id,
      operation: "update",
      before: null,
      after: { event: "pin_locked_24h" },
    });
  }
  await padTo(startedAt);
  if (error && notACredentialError(error.status)) return fail("busy", lang);
  if (gate.lastDay) return fail("locked_day", lang);
  if (gate.lastShort) return fail("locked", lang);
  return fail("generic_signin", lang);
}

// ── sign in from a remembered device (PIN only) ──────────────────────────────

/**
 * The returning-device form: the server resolves the member from the httpOnly
 * device cookie (hash lookup), then runs the same checks as the full form: the
 * per-IP limit, then the per-account lockout keyed on the resolved profile's
 * name_key + birthday, which is exactly the key the full form uses, so both
 * paths drain one shared counter. An unknown, revoked or expired token clears
 * the cookie and answers "device_unknown" (the page then shows the full form).
 */
export async function signInWithDevice(rawPin: string, lang: Lang): Promise<PinResult> {
  const startedAt = Date.now();
  const parsed = pinSchema.safeParse(rawPin);
  if (!parsed.success) return fail("pin_format", lang);
  const pin = parsed.data;
  const secret = env().SUPABASE_SERVICE_ROLE_KEY;

  const ip = await clientIp();
  const ipCheck = await checkLimitStrict("pinIp", sha(`ip:${ip}`));
  if (ipCheck.unavailable) return fail("busy", lang);
  if (!ipCheck.success) return fail("too_many_ip", lang);

  const lookup = await lookupRememberedDevice();
  if (lookup.state !== "ok") {
    if (lookup.state === "stale") await clearDeviceCookie();
    await padTo(startedAt);
    return fail("device_unknown", lang);
  }
  const { device } = lookup;

  const lockId = pinAccountLockId(device.nameKey, device.dateOfBirth);
  const gate = await takeAttempt(lockId);
  if (!gate.ok) {
    await padTo(startedAt);
    return fail(gate.code, lang);
  }

  const result = await attemptPinSignIn({ profile: { id: device.profileId }, lockId, gate, pin, startedAt, lang, secret });
  if (result.ok) await touchDevice(device.deviceId);
  return result;
}

// ── join ─────────────────────────────────────────────────────────────────────
//
// Three steps, each re-checked on the server:
//  1. checkFamilyPinForJoin: the family PIN, 10 tries / hour / IP; a right
//     answer returns a 30-minute ticket (lib/auth/join-ticket.ts).
//  2. checkJoinFirstName: with the ticket, is this first name free, or does
//     the person need to add a birthday to be told apart?
//  3. joinWithPin: with the ticket, first name (+ birthday when needed) and PIN.

export type JoinStepResult<T> = ({ ok: true } & T) | { ok: false; code: PinMessageCode; error: string };

const failStep = (code: PinMessageCode, lang: Lang) => ({ ok: false as const, code, error: pinMessage(code, lang) });

export async function checkFamilyPinForJoin(rawFamilyPin: string, lang: Lang): Promise<JoinStepResult<{ ticket: string }>> {
  const parsed = familyPinSchema.safeParse(rawFamilyPin);
  if (!parsed.success) return failStep(firstIssueCode(parsed.error), lang);

  // 10 tries / hour / IP, taken BEFORE comparing (atomic, so parallel requests
  // cannot all pass a "tries left" read); constant time.
  const famCheck = await checkLimitStrict("familyPin", sha(`ip:${await clientIp()}`));
  if (famCheck.unavailable) return failStep("busy", lang);
  if (!famCheck.success) return failStep("too_many_ip", lang);

  let expected: string;
  try {
    expected = await getOrCreateFamilyPin();
  } catch (e) {
    console.error("[pin-join] family PIN unavailable:", e instanceof Error ? e.message : e);
    return failStep("failed", lang);
  }
  if (!constantTimeEqual(parsed.data, expected)) return failStep("family_pin_wrong", lang);
  return { ok: true, ticket: issueJoinTicket(expected, env().SUPABASE_SERVICE_ROLE_KEY) };
}

/** The ticket is valid for the current family PIN. */
async function ticketIsValid(ticket: string): Promise<boolean | "unavailable"> {
  try {
    return verifyJoinTicket(ticket, await getOrCreateFamilyPin(), env().SUPABASE_SERVICE_ROLE_KEY);
  } catch (e) {
    console.error("[pin-join] family PIN unavailable:", e instanceof Error ? e.message : e);
    return "unavailable";
  }
}

/**
 * Does this first name need a birthday? Only for holders of a valid ticket, so
 * strangers cannot ask which first names have accounts. Counted per IP.
 */
export async function checkJoinFirstName(
  raw: { ticket: unknown; firstName: unknown },
  lang: Lang,
): Promise<JoinStepResult<{ needBirthday: boolean }>> {
  const name = pinNameSchema.safeParse(raw.firstName);
  if (!name.success) return failStep(firstIssueCode(name.error), lang);

  const ipCheck = await checkLimitStrict("pinIp", sha(`ip:${await clientIp()}`));
  if (ipCheck.unavailable) return failStep("busy", lang);
  if (!ipCheck.success) return failStep("too_many_ip", lang);

  const valid = typeof raw.ticket === "string" ? await ticketIsValid(raw.ticket) : false;
  if (valid === "unavailable") return failStep("failed", lang);
  if (!valid) return failStep("join_expired", lang);

  const candidates = await listPinCandidates();
  if (!candidates) return failStep("busy", lang);
  return { ok: true, needBirthday: checkJoinName(candidates, name.data).kind !== "free" };
}

export async function joinWithPin(raw: PinJoinInput, lang: Lang): Promise<PinResult> {
  const parsed = pinJoinSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueCode(parsed.error), lang);
  const { ticket, firstName, dateOfBirth, pin } = parsed.data;
  const secret = env().SUPABASE_SERVICE_ROLE_KEY;

  // Cap how many accounts one connection can try to create.
  const ipCheck = await checkLimitStrict("pinIp", sha(`ip:${await clientIp()}`));
  if (ipCheck.unavailable) return fail("busy", lang);
  if (!ipCheck.success) return fail("too_many_ip", lang);

  const valid = await ticketIsValid(ticket);
  if (valid === "unavailable") return fail("failed", lang);
  if (!valid) return fail("join_expired", lang);

  // Re-decide here (never trust the browser): a birthday is required when the
  // first name is taken, and two people may not share first name + birthday.
  const candidates = await listPinCandidates();
  if (!candidates) return fail("busy", lang);
  const check = checkJoinName(candidates, firstName, dateOfBirth);
  if (check.kind === "need_birthday") return fail("join_need_birthday", lang);
  if (check.kind === "taken") return fail("duplicate", lang);

  // New accounts are keyed on the first name alone (older ones on first + last).
  const nameKey = normaliseName(firstName);
  const dob = dateOfBirth ?? null;
  // Lost a race with someone joining under the same name at the same moment.
  const raceCode: PinMessageCode = dob ? "duplicate" : "join_need_birthday";

  // A ticket can be reused for 30 minutes, so cap the accounts one connection
  // can actually create (a household joining together fits; a flood does not).
  const joinCheck = await checkLimitStrict("pinJoin", sha(`ip:${await clientIp()}`));
  if (joinCheck.unavailable) return fail("busy", lang);
  if (!joinCheck.success) return fail("too_many_ip", lang);

  const svc = createServiceClient();
  // The password starts as random bytes nobody knows; the real (derived) one is
  // set as soon as we know the user id, which the derivation needs.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email: memberEmail(),
    email_confirm: true,
    password: randomBytes(32).toString("base64url"),
    user_metadata: {
      full_name: firstName,
      first_name: firstName,
      ...(dob ? { date_of_birth: dob } : {}),
      login: "pin",
    },
    // app_metadata cannot be set from a browser; handle_new_user trusts only this.
    app_metadata: { login: "pin", name_key: nameKey },
  });
  if (createErr || !created.user) {
    if (isDuplicateIdentityError(createErr)) return fail(raceCode, lang);
    // GoTrue reports a trigger's unique violation as a plain "Database error":
    // look again in case someone with this name joined at the same moment.
    const now = await listPinCandidates();
    if (now && checkJoinName(now, firstName, dateOfBirth).kind !== "free") return fail(raceCode, lang);
    console.error("[pin-join] createUser failed:", createErr?.message);
    return fail("failed", lang);
  }
  const userId = created.user.id;

  // GoTrue can insert the auth row before app_metadata is on it, so
  // handle_new_user may have built a plain email profile. Stamp the PIN
  // identity here (service role) so sign-in, which looks up PIN profiles, finds it.
  const { error: profileErr } = await svc
    .from("profiles")
    .update({
      login_method: "pin",
      name_key: nameKey,
      first_name: firstName,
      last_name: null,
      date_of_birth: dob,
      full_name: firstName,
      display_name: firstName,
      email: null,
    })
    .eq("id", userId);
  if (profileErr) {
    await svc.auth.admin.deleteUser(userId);
    if (isDuplicateIdentityError(profileErr)) return fail(raceCode, lang);
    console.error("[pin-join] could not mark the profile as PIN:", profileErr.message);
    return fail("failed", lang);
  }

  const { error: pwErr } = await svc.auth.admin.updateUserById(userId, {
    password: derivePinPassword(userId, pin, secret),
  });
  if (pwErr) {
    console.error("[pin-join] could not set the password:", pwErr.message);
    await svc.auth.admin.deleteUser(userId);
    return fail("failed", lang);
  }

  await writeAudit({
    actorId: userId,
    rowId: userId,
    operation: "insert",
    before: null,
    after: { event: "pin_join", name: firstName },
  });

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: created.user.email ?? "",
    password: derivePinPassword(userId, pin, secret),
  });
  if (signInErr) {
    // The account exists; they can sign in by hand.
    console.error("[pin-join] auto sign-in failed:", signInErr.message);
    return fail("failed", lang);
  }
  await rememberDevice(userId);
  return { ok: true, redirectTo: "/welcome" };
}

// ── change my PIN ────────────────────────────────────────────────────────────

export async function changeOwnPin(raw: ChangePinInput, lang: Lang): Promise<PinResult> {
  const parsed = changePinSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueCode(parsed.error), lang);
  const { oldPin, newPin } = parsed.data;
  const secret = env().SUPABASE_SERVICE_ROLE_KEY;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("not_signed_in", lang);

  const svc = createServiceClient();
  const { data: profile } = await svc.from("profiles").select("id, login_method").eq("id", user.id).maybeSingle();
  if ((profile as { login_method?: string } | null)?.login_method !== "pin") return fail("failed", lang);

  const lockId = pinUserLockId(user.id);
  const gate = await takeAttempt(lockId);
  if (!gate.ok) return fail(gate.code, lang);

  // Check the current PIN on a throwaway client so this session's cookies are untouched.
  const e = env();
  const probe = createSupabaseClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: oldErr } = await probe.auth.signInWithPassword({
    email: user.email,
    password: derivePinPassword(user.id, oldPin, secret),
  });
  if (oldErr) {
    if (notACredentialError(oldErr.status)) return fail("busy", lang);
    return fail(gate.lastDay ? "locked_day" : gate.lastShort ? "locked" : "old_pin_wrong", lang);
  }

  const { error: updErr } = await svc.auth.admin.updateUserById(user.id, {
    password: derivePinPassword(user.id, newPin, secret),
  });
  if (updErr) {
    console.error("[pin-change] update failed:", updErr.message);
    return fail("failed", lang);
  }
  // Service role is a backend role, so the profiles guard allows this.
  await svc.from("profiles").update({ pin_must_change: false }).eq("id", user.id);
  await clearPinLockout(lockId);
  await writeAudit({
    actorId: user.id,
    rowId: user.id,
    operation: "update",
    before: null,
    after: { event: "pin_changed_by_member" },
  });
  // The old PIN is gone, so every remembered device is forgotten; this one is
  // remembered again straight away (the member is signed in on it right now).
  await revokeDevices(user.id, user.id, "pin_changed");
  await rememberDevice(user.id);
  return { ok: true, redirectTo: "/" };
}
