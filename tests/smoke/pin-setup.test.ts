import { describe, expect, it } from "vitest";
import {
  APP_META_KEYS,
  buildPinMetadata,
  canSetUpPin,
  hasRealEmail,
  hasRecentEmailLinkSignIn,
  isFreshSignIn,
  isPlaceholderEmail,
  PLACEHOLDER_EMAIL_DOMAIN,
  pinSetupSchema,
  planAuthRollback,
  RECOVER_LINK_WINDOW_MS,
  SETUP_FRESH_SESSION_MS,
  splitName,
  updatePasswordRedirect,
} from "@/lib/auth/pin-setup";
import { MEMBER_EMAIL_DOMAIN, memberEmail } from "@/lib/auth/pin-crypto";
import { firstIssueCode, isDuplicateIdentityError, makeNameKey, pinMessage } from "@/lib/auth/pin-validation";
import { callerOf, canActOn } from "@/lib/members/permissions";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-29T12:00:00Z");

describe("canSetUpPin (self only, email accounts only)", () => {
  it("lets an email account convert itself", () => {
    expect(canSetUpPin({ sessionUserId: ME, targetId: ME, loginMethod: "email", email: "a@b.com" })).toEqual({ ok: true, mode: "convert" });
  });
  it("refuses when signed out", () => {
    expect(canSetUpPin({ sessionUserId: null, targetId: ME, loginMethod: "email", email: "a@b.com" })).toEqual({ ok: false, reason: "not_signed_in" });
  });
  it("refuses any other user's id", () => {
    expect(canSetUpPin({ sessionUserId: ME, targetId: OTHER, loginMethod: "email", email: "a@b.com" })).toEqual({ ok: false, reason: "not_self" });
  });
  it("a PIN account with a real email may recover; a placeholder one may not", () => {
    expect(canSetUpPin({ sessionUserId: ME, targetId: ME, loginMethod: "pin", email: "a@b.com" })).toEqual({ ok: true, mode: "recover" });
    expect(canSetUpPin({ sessionUserId: ME, targetId: ME, loginMethod: "pin", email: memberEmail(ME) })).toEqual({ ok: false, reason: "no_real_email" });
  });
  it("refuses unknown login methods", () => {
    expect(canSetUpPin({ sessionUserId: ME, targetId: ME, loginMethod: null, email: "a@b.com" }).ok).toBe(false);
  });
});

describe("placeholder emails", () => {
  it("matches the server constant", () => {
    expect(PLACEHOLDER_EMAIL_DOMAIN).toBe(MEMBER_EMAIL_DOMAIN);
  });
  it("detects placeholders only", () => {
    expect(isPlaceholderEmail(memberEmail())).toBe(true);
    expect(isPlaceholderEmail(null)).toBe(true);
    expect(hasRealEmail("owner@gmail.com")).toBe(true);
    expect(hasRealEmail("x@members.bigfatfamilytree.com.au.example.com")).toBe(true);
  });
});

describe("session freshness", () => {
  it("accepts a sign-in within 24h", () => {
    expect(isFreshSignIn(new Date(NOW - 60_000).toISOString(), NOW, SETUP_FRESH_SESSION_MS)).toBe(true);
  });
  it("rejects stale, missing, garbage and future times", () => {
    expect(isFreshSignIn(new Date(NOW - SETUP_FRESH_SESSION_MS - 1).toISOString(), NOW, SETUP_FRESH_SESSION_MS)).toBe(false);
    expect(isFreshSignIn(null, NOW, SETUP_FRESH_SESSION_MS)).toBe(false);
    expect(isFreshSignIn("nope", NOW, SETUP_FRESH_SESSION_MS)).toBe(false);
    expect(isFreshSignIn(new Date(NOW + 60_000).toISOString(), NOW, SETUP_FRESH_SESSION_MS)).toBe(false);
  });
  it("email-link sign-in within 15 minutes counts; password/PIN sign-in never does", () => {
    const secs = (msAgo: number) => Math.floor((NOW - msAgo) / 1000);
    expect(hasRecentEmailLinkSignIn([{ method: "otp", timestamp: secs(60_000) }], NOW, RECOVER_LINK_WINDOW_MS)).toBe(true);
    expect(hasRecentEmailLinkSignIn([{ method: "recovery", timestamp: secs(60_000) }], NOW, RECOVER_LINK_WINDOW_MS)).toBe(true);
    expect(hasRecentEmailLinkSignIn([{ method: "otp", timestamp: secs(16 * 60_000) }], NOW, RECOVER_LINK_WINDOW_MS)).toBe(false);
    expect(hasRecentEmailLinkSignIn([{ method: "password", timestamp: secs(1000) }], NOW, RECOVER_LINK_WINDOW_MS)).toBe(false);
    expect(hasRecentEmailLinkSignIn(undefined, NOW, RECOVER_LINK_WINDOW_MS)).toBe(false);
    expect(hasRecentEmailLinkSignIn([{ method: "otp" }], NOW, RECOVER_LINK_WINDOW_MS)).toBe(false);
  });
});

describe("pinSetupSchema", () => {
  const ok = { firstName: "Basem", lastName: "Morkos", dateOfBirth: "1998-04-02", pin: "7391", pinConfirm: "7391" };
  const code = (v: object) => {
    const r = pinSetupSchema.safeParse({ ...ok, ...v });
    return r.success ? null : firstIssueCode(r.error);
  };
  it("accepts a good form", () => {
    expect(pinSetupSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects trivial PINs, mismatches and missing birthdays", () => {
    expect(code({ pin: "1234", pinConfirm: "1234" })).toBe("pin_trivial");
    expect(code({ pinConfirm: "7392" })).toBe("pin_mismatch");
    expect(code({ dateOfBirth: "" })).toBe("dob_invalid");
  });
  it("accepts Arabic-Indic digits in both PIN boxes", () => {
    expect(pinSetupSchema.safeParse({ ...ok, pin: "٧٣٩١", pinConfirm: "٧٣٩١" }).success).toBe(true);
  });
});

describe("duplicate rule", () => {
  it("is name_key + birthday, with the same friendly message as joining", () => {
    expect(makeNameKey("Basem", "Morkos")).toBe(makeNameKey(" basem ", "MORKOS"));
    expect(isDuplicateIdentityError({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_pin_identity_uidx"' })).toBe(true);
    expect(pinMessage("duplicate", "en")).toMatch(/already has an account/);
  });
});

describe("splitName", () => {
  it("prefers stored names, else splits full_name at the first space", () => {
    expect(splitName({ first_name: "A", last_name: "B", full_name: "X Y" })).toEqual({ firstName: "A", lastName: "B" });
    expect(splitName({ full_name: "Nadir El Masry" })).toEqual({ firstName: "Nadir", lastName: "El Masry" });
    expect(splitName({ full_name: "Madonna" })).toEqual({ firstName: "Madonna", lastName: "" });
    expect(splitName({ display_name: "Sam Lee" })).toEqual({ firstName: "Sam", lastName: "Lee" });
    expect(splitName({})).toEqual({ firstName: "", lastName: "" });
  });
});

describe("rollback plan", () => {
  it("restores metadata, removing the keys step 1 added, and randomises the password", () => {
    const previous = { appMetadata: { provider: "email", providers: ["email"] }, userMetadata: { full_name: "Old Name", avatar_url: "u" } };
    const meta = buildPinMetadata(previous, { nameKey: "basem morkos", firstName: "Basem", lastName: "Morkos", dateOfBirth: "1998-04-02" });
    expect(meta.appMetadata).toMatchObject({ provider: "email", login: "pin", name_key: "basem morkos" });
    const plan = planAuthRollback(previous);
    expect(plan.randomisePassword).toBe(true);
    expect(plan.appMetadata).toEqual({ provider: "email", providers: ["email"], login: null, name_key: null });
    expect(plan.userMetadata).toMatchObject({ full_name: "Old Name", avatar_url: "u", first_name: null, last_name: null, date_of_birth: null, login: null });
  });
  it("puts a pre-existing value back instead of nulling it", () => {
    const plan = planAuthRollback({ appMetadata: { login: "email" }, userMetadata: null });
    expect(plan.appMetadata.login).toBe("email");
    for (const k of APP_META_KEYS) expect(k in plan.appMetadata).toBe(true);
  });
});

describe("/update-password redirect rule", () => {
  it("sends PIN accounts to Change my PIN, leaves everyone else", () => {
    expect(updatePasswordRedirect({ login: "pin" })).toBe("/account/pin");
    expect(updatePasswordRedirect({ provider: "email" })).toBeNull();
    expect(updatePasswordRedirect(undefined)).toBeNull();
  });
});

describe("admin Reset PIN on a converted account", () => {
  const owner = callerOf({ role: "admin", is_super_admin: true });
  const admin = callerOf({ role: "admin", is_super_admin: false });
  const converted = { id: OTHER, role: "admin" as const, isSuperAdmin: false, loginMethod: "pin" as const };
  it("super admin can reset a converted admin; a plain admin cannot", () => {
    expect(canActOn(owner, ME, "reset_pin", converted).ok).toBe(true);
    expect(canActOn(admin, ME, "reset_pin", converted)).toEqual({ ok: false, reason: "admin" });
  });
  it("the owner cannot reset their own PIN (they use Change my PIN)", () => {
    expect(canActOn(owner, ME, "reset_pin", { ...converted, id: ME, isSuperAdmin: true })).toEqual({ ok: false, reason: "self" });
  });
});
