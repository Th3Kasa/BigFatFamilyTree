import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { env } from "@/lib/env";
import { checkLimit } from "@/lib/ratelimit";
import { writeAudit } from "@/lib/members/account-admin";
import { derivePinPassword } from "@/lib/auth/pin-crypto";
import { revokeDevices } from "@/lib/auth/pin-device-store";
import { clearPinLockout, pinAccountLockId, pinUserLockId, type PinResult } from "@/lib/auth/pin-session";
import {
  firstIssueCode,
  isDuplicateIdentityError,
  makeNameKey,
  pinMessage,
  type Lang,
  type PinMessageCode,
} from "@/lib/auth/pin-validation";
import {
  buildPinMetadata,
  canSetUpPin,
  hasRecentEmailLinkSignIn,
  isFreshSignIn,
  pinSetupSchema,
  planAuthRollback,
  RECOVER_LINK_WINDOW_MS,
  SETUP_FRESH_SESSION_MS,
  type AmrEntry,
  type PinSetupInput,
} from "@/lib/auth/pin-setup";

// Switch an email account to PIN sign-in, or set a new PIN without the old one.
// Server-only (service role). The account being changed is ALWAYS the signed-in
// user's own id, read from the verified session, never from the request.
//
// Re-authentication (chosen: a fresh session, not the email password):
//  * converting: the session must have started within 24 hours. Many email
//    accounts (admins signing in by magic link) have no password at all, so
//    "type your password" cannot be the check; "signed in recently" works for
//    everyone and a stale session is told to sign in again with an email link.
//  * setting a PIN without the old one: the session must have been started by an
//    email link (magic link / reset link) within 15 minutes. A PIN sign-in does
//    not count, so a stranger on a just-unlocked phone can't skip the old PIN.

const fail = (code: PinMessageCode, lang: Lang): PinResult => ({ ok: false, code, error: pinMessage(code, lang) });

type ProfileRow = {
  id: string;
  login_method: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  display_name: string | null;
  name_key: string | null;
  date_of_birth: string | null;
};

/** The identity (name + birthday) that will become the username. */
async function pinIdentityTaken(nameKey: string, dateOfBirth: string, exceptId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("profiles")
    .select("id")
    .eq("name_key", nameKey)
    .eq("date_of_birth", dateOfBirth)
    .eq("login_method", "pin")
    .neq("id", exceptId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function setUpOwnPin(raw: PinSetupInput, lang: Lang): Promise<PinResult> {
  const parsed = pinSetupSchema.safeParse(raw);
  if (!parsed.success) return fail(firstIssueCode(parsed.error), lang);
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("not_signed_in", lang);

  const limit = await checkLimit("generic", `setup-pin:${user.id}`);
  if (!limit.success) return fail("busy", lang);

  const svc = createServiceClient();
  const { data: profileData } = await svc
    .from("profiles")
    .select("id, login_method, first_name, last_name, full_name, display_name, name_key, date_of_birth")
    .eq("id", user.id)
    .maybeSingle();
  const profile = profileData as ProfileRow | null;
  if (!profile) return fail("not_allowed", lang);

  const verdict = canSetUpPin({
    sessionUserId: user.id,
    targetId: profile.id,
    loginMethod: profile.login_method,
    email: user.email,
  });
  if (!verdict.ok) return fail("not_allowed", lang);
  const mode = verdict.mode;

  // Fresh-session checks.
  const now = Date.now();
  if (mode === "convert") {
    if (!isFreshSignIn(user.last_sign_in_at, now, SETUP_FRESH_SESSION_MS)) return fail("stale_session", lang);
  } else {
    const { data: claimData } = await supabase.auth.getClaims();
    const amr = (claimData?.claims as { amr?: AmrEntry[] } | undefined)?.amr;
    if (!hasRecentEmailLinkSignIn(amr, now, RECOVER_LINK_WINDOW_MS)) return fail("link_required", lang);
  }

  // The username. Converting takes what was typed; a PIN account that only
  // forgot its PIN keeps the name and birthday it already has.
  let firstName = input.firstName;
  let lastName = input.lastName;
  let dateOfBirth = input.dateOfBirth;
  let nameKey = makeNameKey(firstName, lastName);
  if (mode === "recover") {
    if (!profile.first_name || !profile.last_name || !profile.date_of_birth || !profile.name_key) {
      return fail("failed", lang);
    }
    firstName = profile.first_name;
    lastName = profile.last_name;
    dateOfBirth = profile.date_of_birth;
    nameKey = profile.name_key;
  }

  if (mode === "convert" && (await pinIdentityTaken(nameKey, dateOfBirth, user.id))) return fail("duplicate", lang);

  const secret = env().SUPABASE_SERVICE_ROLE_KEY;
  const password = derivePinPassword(user.id, input.pin, secret);

  // Read the metadata as it is NOW (for the rollback), not from the cached session.
  const { data: authData, error: readErr } = await svc.auth.admin.getUserById(user.id);
  if (readErr || !authData.user) {
    console.error("[pin-setup] could not read the auth user:", readErr?.message);
    return fail("failed", lang);
  }
  const previous = {
    appMetadata: (authData.user.app_metadata ?? {}) as Record<string, unknown>,
    userMetadata: (authData.user.user_metadata ?? {}) as Record<string, unknown>,
  };

  // ── Recover: the account is already a PIN account; only the password changes.
  if (mode === "recover") {
    const { error } = await svc.auth.admin.updateUserById(user.id, { password });
    if (error) {
      console.error("[pin-setup] recover: password update failed:", error.message);
      return fail("failed", lang);
    }
    const { error: flagErr } = await svc.from("profiles").update({ pin_must_change: false }).eq("id", user.id);
    if (flagErr) console.error("[pin-setup] recover: could not clear pin_must_change:", flagErr.message);
    await finish(user.id, nameKey, dateOfBirth, "pin_set_via_email_link");
    return { ok: true, redirectTo: "/" };
  }

  // ── Convert, step 1: the auth user. Real email is untouched.
  const meta = buildPinMetadata(previous, { nameKey, firstName, lastName, dateOfBirth });
  const { error: authErr } = await svc.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: meta.appMetadata,
    user_metadata: meta.userMetadata,
  });
  if (authErr) {
    console.error("[pin-setup] auth update failed:", authErr.message);
    return fail("failed", lang);
  }

  // ── Convert, step 2: the profile (service role = backend role, so the guard allows it,
  // including the owner's own row). The unique index decides a duplicate race.
  const { data: updated, error: profErr } = await svc
    .from("profiles")
    .update({
      login_method: "pin",
      first_name: firstName,
      last_name: lastName,
      name_key: nameKey,
      date_of_birth: dateOfBirth,
      pin_must_change: false,
    })
    .eq("id", user.id)
    .eq("login_method", "email")
    .select("id");

  if (profErr || !updated || updated.length !== 1) {
    await rollbackAuth(user.id, previous);
    if (isDuplicateIdentityError(profErr) || (await pinIdentityTaken(nameKey, dateOfBirth, user.id))) {
      return fail("duplicate", lang);
    }
    console.error("[pin-setup] profile update failed:", profErr?.message ?? "no row updated");
    return fail("failed", lang);
  }

  await finish(user.id, nameKey, dateOfBirth, "pin_set_up_from_email");
  return { ok: true, redirectTo: "/" };
}

/** Undo step 1: metadata back, and a random password (see planAuthRollback). Best effort, logged. */
async function rollbackAuth(
  userId: string,
  previous: { appMetadata: Record<string, unknown>; userMetadata: Record<string, unknown> },
): Promise<void> {
  const plan = planAuthRollback(previous);
  const { error } = await createServiceClient().auth.admin.updateUserById(userId, {
    app_metadata: plan.appMetadata,
    user_metadata: plan.userMetadata,
    password: plan.randomisePassword ? randomBytes(32).toString("base64url") : undefined,
  });
  if (error) console.error("[pin-setup] ROLLBACK FAILED for", userId, error.message);
}

/** Clear tries for this identity, forget remembered devices, and write the audit entry (never the PIN). */
async function finish(userId: string, nameKey: string, dateOfBirth: string, event: string): Promise<void> {
  await Promise.all([clearPinLockout(pinAccountLockId(nameKey, dateOfBirth)), clearPinLockout(pinUserLockId(userId))]);
  // A new PIN means every device that remembered the old one starts again.
  await revokeDevices(userId, userId, "pin_set_up_from_email");
  await writeAudit({
    actorId: userId,
    rowId: userId,
    operation: "update",
    before: null,
    after: { event },
  });
}
