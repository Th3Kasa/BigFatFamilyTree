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
import {
  changePinSchema,
  firstIssueCode,
  isDuplicateIdentityError,
  makeNameKey,
  pinJoinSchema,
  pinMessage,
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

/** The Redis identifier of one PIN account's lockout counters (never the raw name or birthday). */
export function pinAccountLockId(nameKey: string, dateOfBirth: string): string {
  return sha(accountLockKey(nameKey, dateOfBirth));
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

  // 3. Look the account up and try the derived password. When there is no such
  // account we still run a sign-in against a placeholder address.
  const profile = await findPinProfile(nameKey, dateOfBirth);
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

  // 4. Failure (already counted above). The day's last try on a real account
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

// ── join ─────────────────────────────────────────────────────────────────────

export async function joinWithPin(raw: PinJoinInput, lang: Lang): Promise<PinResult> {
  const parsed = pinJoinSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueCode(parsed.error), lang);
  const { firstName, lastName, dateOfBirth, familyPin, pin } = parsed.data;
  const secret = env().SUPABASE_SERVICE_ROLE_KEY;

  const ip = await clientIp();
  const ipId = sha(`ip:${ip}`);

  // Cap how many accounts one connection can try to create.
  const ipCheck = await checkLimitStrict("pinIp", ipId);
  if (ipCheck.unavailable) return fail("busy", lang);
  if (!ipCheck.success) return fail("too_many_ip", lang);

  // Family PIN: 10 tries / hour / IP, taken BEFORE comparing (atomic, so
  // parallel requests cannot all pass a "tries left" read); constant time.
  const famCheck = await checkLimitStrict("familyPin", ipId);
  if (famCheck.unavailable) return fail("busy", lang);
  if (!famCheck.success) return fail("too_many_ip", lang);

  let expected: string;
  try {
    expected = await getOrCreateFamilyPin();
  } catch (e) {
    console.error("[pin-join] family PIN unavailable:", e instanceof Error ? e.message : e);
    return fail("failed", lang);
  }
  if (!constantTimeEqual(familyPin, expected)) return fail("family_pin_wrong", lang);

  const nameKey = makeNameKey(firstName, lastName);
  if (await findPinProfile(nameKey, dateOfBirth)) return fail("duplicate", lang);

  const svc = createServiceClient();
  const fullName = `${firstName} ${lastName}`;
  // The password starts as random bytes nobody knows; the real (derived) one is
  // set as soon as we know the user id, which the derivation needs.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email: memberEmail(),
    email_confirm: true,
    password: randomBytes(32).toString("base64url"),
    user_metadata: {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth,
      login: "pin",
    },
    // app_metadata cannot be set from a browser; handle_new_user trusts only this.
    app_metadata: { login: "pin", name_key: nameKey },
  });
  if (createErr || !created.user) {
    if (isDuplicateIdentityError(createErr) || (await findPinProfile(nameKey, dateOfBirth))) {
      return fail("duplicate", lang);
    }
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
      last_name: lastName,
      date_of_birth: dateOfBirth,
      full_name: fullName,
      display_name: fullName,
      email: null,
    })
    .eq("id", userId);
  if (profileErr) {
    await svc.auth.admin.deleteUser(userId);
    if (isDuplicateIdentityError(profileErr)) return fail("duplicate", lang);
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
    after: { event: "pin_join", name: fullName },
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

  const lockId = sha(`user:${user.id}`);
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
  return { ok: true, redirectTo: "/" };
}
