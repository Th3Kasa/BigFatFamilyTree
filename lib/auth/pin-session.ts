import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { checkLimitStrict, remainingStrict, resetLimit } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/members/account-admin";
import { getOrCreateFamilyPin } from "@/lib/auth/family-pin";
import { constantTimeEqual, derivePinPassword, memberEmail } from "@/lib/auth/pin-crypto";
import { accountLockKey, lockState, remainingDelayMs } from "@/lib/auth/pin-lockout";
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

  // 2. Per account: 5 failed tries lock it for 15 minutes.
  const nameKey = makeNameKey(firstName, lastName);
  const lockId = sha(accountLockKey(nameKey, dateOfBirth));
  const before = await remainingStrict("pinFail", lockId);
  if (before.unavailable) return fail("busy", lang);
  const state = lockState(before.remaining, before.reset, Date.now());
  if (state.locked) {
    await padTo(startedAt);
    return fail("locked", lang);
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
    await resetLimit("pinFail", lockId);
    await padTo(startedAt);
    return { ok: true, redirectTo: "/" };
  }

  // 4. Failure: count it (also for names that do not exist), then say the same thing.
  const counted = await checkLimitStrict("pinFail", lockId);
  await padTo(startedAt);
  if (counted.unavailable) return fail("busy", lang);
  if (error && (error.status ?? 0) >= 500) return fail("failed", lang);
  if (!counted.success || counted.remaining <= 0) return fail("locked", lang);
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

  // Family PIN: 10 wrong tries / hour / IP; compared in constant time.
  const before = await remainingStrict("familyPin", ipId);
  if (before.unavailable) return fail("busy", lang);
  if (before.remaining <= 0) return fail("too_many_ip", lang);

  let expected: string;
  try {
    expected = await getOrCreateFamilyPin();
  } catch (e) {
    console.error("[pin-join] family PIN unavailable:", e instanceof Error ? e.message : e);
    return fail("failed", lang);
  }
  if (!constantTimeEqual(familyPin, expected)) {
    await checkLimitStrict("familyPin", ipId);
    return fail("family_pin_wrong", lang);
  }

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
  const before = await remainingStrict("pinFail", lockId);
  if (before.unavailable) return fail("busy", lang);
  if (lockState(before.remaining, before.reset, Date.now()).locked) return fail("locked", lang);

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
    if ((oldErr.status ?? 0) >= 500) return fail("failed", lang);
    const counted = await checkLimitStrict("pinFail", lockId);
    if (counted.unavailable) return fail("busy", lang);
    return fail(counted.remaining <= 0 ? "locked" : "old_pin_wrong", lang);
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
  await resetLimit("pinFail", lockId);
  await writeAudit({
    actorId: user.id,
    rowId: user.id,
    operation: "update",
    before: null,
    after: { event: "pin_changed_by_member" },
  });
  return { ok: true, redirectTo: "/" };
}
