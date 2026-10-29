// Pure (client- and server-safe) rules for "switch my email account to PIN
// sign-in" and "set a new PIN without the old one". No I/O here, so every rule
// is unit-tested; lib/auth/pin-setup-session.ts does the work around them.

import { z } from "zod";
import { newPinSchema, normaliseDigits, pinDobSchema, pinNameSchema } from "@/lib/auth/pin-validation";

/** An email account's session must have started within this long (convert to PIN). */
export const SETUP_FRESH_SESSION_MS = 24 * 60 * 60 * 1000;
/** Setting a new PIN without the old one needs an email-link sign-in this recent. */
export const RECOVER_LINK_WINDOW_MS = 15 * 60 * 1000;

/** Same value as MEMBER_EMAIL_DOMAIN in pin-crypto.ts (that file is server-only; a test keeps them equal). */
export const PLACEHOLDER_EMAIL_DOMAIN = "members.bigfatfamilytree.com.au";

/** Placeholder addresses can't receive mail, so they can never be used to recover an account. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

export const hasRealEmail = (email: string | null | undefined): boolean => !isPlaceholderEmail(email);

// ── who may set up a PIN ────────────────────────────────────────────────────

export type SetupMode = "convert" | "recover";
export type SetupDenied = "not_signed_in" | "not_self" | "no_profile" | "no_real_email";
export type SetupVerdict = { ok: true; mode: SetupMode } | { ok: false; reason: SetupDenied };

/**
 * May this caller set up a PIN on this account?
 *  * only the signed-in user, only on their own id (`targetId` must equal the
 *    session user; the server never reads an id from the browser);
 *  * an email account may convert;
 *  * a PIN account may set a new PIN without the old one ("recover") only if it
 *    has a real email, since that is how it proves it is the owner.
 */
export function canSetUpPin(input: {
  sessionUserId: string | null | undefined;
  targetId: string;
  loginMethod: string | null | undefined;
  email: string | null | undefined;
}): SetupVerdict {
  if (!input.sessionUserId) return { ok: false, reason: "not_signed_in" };
  if (input.sessionUserId !== input.targetId) return { ok: false, reason: "not_self" };
  if (input.loginMethod === "email") return { ok: true, mode: "convert" };
  if (input.loginMethod === "pin") {
    return hasRealEmail(input.email) ? { ok: true, mode: "recover" } : { ok: false, reason: "no_real_email" };
  }
  return { ok: false, reason: "no_profile" };
}

// ── session freshness ───────────────────────────────────────────────────────

/** Is an ISO timestamp (auth.users.last_sign_in_at) no older than `maxAgeMs`? Unknown or future-dated times are not fresh. */
export function isFreshSignIn(lastSignInAt: string | null | undefined, now: number, maxAgeMs: number): boolean {
  if (!lastSignInAt) return false;
  const t = Date.parse(lastSignInAt);
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= 0 && age <= maxAgeMs;
}

export type AmrEntry = { method?: string; timestamp?: number };

const EMAIL_LINK_METHODS: ReadonlySet<string> = new Set(["otp", "magiclink", "recovery"]);

/**
 * Did this session start with an email link (magic link or password-reset link)
 * within the window? `amr` is the JWT's authentication-methods claim; timestamps
 * are in seconds. A PIN sign-in is a "password" method and never counts, so a
 * stranger holding a just-unlocked phone cannot skip the old PIN.
 */
export function hasRecentEmailLinkSignIn(
  amr: readonly AmrEntry[] | null | undefined,
  now: number,
  windowMs: number,
): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((a) => {
    if (!a || typeof a.method !== "string" || !EMAIL_LINK_METHODS.has(a.method)) return false;
    if (typeof a.timestamp !== "number") return false;
    const age = now - a.timestamp * 1000;
    return age >= 0 && age <= windowMs;
  });
}

// ── form / input ────────────────────────────────────────────────────────────

export const pinSetupSchema = z
  .object({
    firstName: pinNameSchema,
    lastName: pinNameSchema,
    dateOfBirth: pinDobSchema,
    pin: newPinSchema,
    pinConfirm: z.string(),
  })
  .refine((v) => v.pin === normaliseDigits(v.pinConfirm), { path: ["pinConfirm"], message: "pin_mismatch" });
export type PinSetupInput = z.input<typeof pinSetupSchema>;

/** Prefill for the form: stored first/last name if any, else split full_name at the first space. */
export function splitName(p: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
}): { firstName: string; lastName: string } {
  const first = p.first_name?.trim();
  const last = p.last_name?.trim();
  if (first && last) return { firstName: first, lastName: last };
  const full = (p.full_name ?? p.display_name ?? "").replace(/\s+/g, " ").trim();
  if (!full) return { firstName: first ?? "", lastName: last ?? "" };
  const i = full.indexOf(" ");
  if (i < 0) return { firstName: first || full, lastName: last ?? "" };
  return { firstName: first || full.slice(0, i), lastName: last || full.slice(i + 1) };
}

// ── rollback ────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

/** The metadata keys step 1 adds to the auth user. */
export const APP_META_KEYS = ["login", "name_key"] as const;
export const USER_META_KEYS = ["full_name", "first_name", "last_name", "date_of_birth", "login"] as const;

/** `previous` with every key in `keys` put back (or set to null when it did not exist, which removes it). */
function restoreKeys(previous: Json, keys: readonly string[]): Json {
  const out: Json = { ...previous };
  for (const k of keys) if (!(k in previous)) out[k] = null;
  return out;
}

export type RollbackStep = { appMetadata: Json; userMetadata: Json; randomisePassword: true };

/**
 * If the profile update fails after the auth user was changed, undo the auth
 * change: put the metadata back and replace the (PIN-derived) password with
 * random bytes. The old email password cannot be restored (it is never known),
 * and a random one is safer than leaving a half-set-up PIN. Pure so it is tested.
 */
export function planAuthRollback(previous: {
  appMetadata: Json | null | undefined;
  userMetadata: Json | null | undefined;
}): RollbackStep {
  return {
    appMetadata: restoreKeys(previous.appMetadata ?? {}, APP_META_KEYS),
    userMetadata: restoreKeys(previous.userMetadata ?? {}, USER_META_KEYS),
    randomisePassword: true,
  };
}

/** The metadata step 1 writes: existing values kept, PIN keys added. */
export function buildPinMetadata(
  previous: { appMetadata: Json | null | undefined; userMetadata: Json | null | undefined },
  identity: { nameKey: string; firstName: string; lastName: string; dateOfBirth: string },
): { appMetadata: Json; userMetadata: Json } {
  return {
    appMetadata: { ...(previous.appMetadata ?? {}), login: "pin", name_key: identity.nameKey },
    userMetadata: {
      ...(previous.userMetadata ?? {}),
      full_name: `${identity.firstName} ${identity.lastName}`,
      first_name: identity.firstName,
      last_name: identity.lastName,
      date_of_birth: identity.dateOfBirth,
      login: "pin",
    },
  };
}

// ── /update-password ────────────────────────────────────────────────────────

/**
 * Where /update-password must send a signed-in account instead of showing the
 * "set an email password" form. A PIN account signs in with its PIN, and a new
 * email password would silently replace the PIN-derived one, so it goes to
 * "Change my PIN". Email accounts (and visitors with no session) stay.
 */
export function updatePasswordRedirect(appMetadata: Json | null | undefined): string | null {
  return appMetadata?.login === "pin" ? "/account/pin" : null;
}
