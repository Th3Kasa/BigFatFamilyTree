import { describe, expect, it } from "vitest";
import {
  changePinSchema,
  familyPinSchema,
  firstIssueCode,
  isDuplicateIdentityError,
  isTrivialPin,
  makeNameKey,
  newPinSchema,
  normaliseDigits,
  normaliseName,
  PIN_MESSAGES,
  pinJoinSchema,
  pinMessage,
  pinNameSchema,
  pinSignInSchema,
} from "@/lib/auth/pin-validation";
import {
  accountLockKey,
  lockedAfterFailure,
  lockState,
  PIN_LOCK_MINUTES,
  PIN_MAX_FAILURES,
  PIN_MIN_RESPONSE_MS,
  remainingDelayMs,
} from "@/lib/auth/pin-lockout";
import {
  constantTimeEqual,
  derivePinPassword,
  generateFamilyPin,
  generateTempPin,
  memberEmail,
  MEMBER_EMAIL_DOMAIN,
} from "@/lib/auth/pin-crypto";
import { getOrCreateFamilyPin } from "@/lib/auth/family-pin";
import { callerOf, can, canActOn, type Caller, type Target } from "@/lib/members/permissions";
import { familyInviteMessage } from "@/lib/members/family-invite";

const SECRET = "service-role-key-for-tests";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("PIN validation", () => {
  it.each(["0000", "1111", "9999", "1234", "4321", "2345", "3210", "1212", "2121", "1122", "9900", "2580"])(
    "%s is too easy",
    (pin) => {
      expect(isTrivialPin(pin)).toBe(true);
      const r = newPinSchema.safeParse(pin);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("pin_trivial");
    },
  );

  it.each(["4821", "7391", "0615", "9084"])("%s is accepted", (pin) => {
    expect(isTrivialPin(pin)).toBe(false);
    expect(newPinSchema.safeParse(pin).success).toBe(true);
  });

  it.each(["123", "12345", "12a4", "", "    "])("%j is not 4 digits", (pin) => {
    const r = newPinSchema.safeParse(pin);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("pin_format");
  });

  it("accepts Arabic-Indic and Persian digits (Arabic keyboards)", () => {
    expect(normaliseDigits("٤٨٢١")).toBe("4821");
    expect(normaliseDigits("۴۸۲۱")).toBe("4821");
    expect(newPinSchema.parse("٤٨٢١")).toBe("4821");
  });

  it("family PIN is exactly 6 digits", () => {
    expect(familyPinSchema.safeParse("123456").success).toBe(true);
    expect(familyPinSchema.safeParse("٠٠١٢٣٤").success).toBe(true);
    expect(familyPinSchema.safeParse("12345").success).toBe(false);
    expect(familyPinSchema.safeParse("1234567").success).toBe(false);
    expect(familyPinSchema.safeParse("12345a").success).toBe(false);
  });

  it("names: 1-60 letters, spaces, hyphens, apostrophes, Arabic", () => {
    for (const ok of ["Omar", "Mary-Jane", "O'Brien", "O’Brien", "Anne Marie", "عمر", "عبد الرحمن", "José"]) {
      expect(pinNameSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ["", "   ", "Omar1", "Om@r", "-Omar", "'", "a".repeat(61), "Omar<script>"]) {
      expect(pinNameSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(pinNameSchema.safeParse("a".repeat(60)).success).toBe(true);
  });

  it("join: everything valid passes; mismatched PINs, trivial PINs and a short family PIN fail with friendly codes", () => {
    const good = {
      firstName: "Omar",
      lastName: "Haddad",
      dateOfBirth: "1990-04-12",
      familyPin: "123456",
      pin: "4821",
      pinConfirm: "4821",
    };
    expect(pinJoinSchema.safeParse(good).success).toBe(true);
    const code = (patch: Partial<typeof good>) => {
      const r = pinJoinSchema.safeParse({ ...good, ...patch });
      return r.success ? "ok" : firstIssueCode(r.error);
    };
    expect(code({ pinConfirm: "4822" })).toBe("pin_mismatch");
    expect(code({ pin: "1234", pinConfirm: "1234" })).toBe("pin_trivial");
    expect(code({ familyPin: "12345" })).toBe("family_pin_format");
    expect(code({ dateOfBirth: "1899-12-31" })).toBe("dob_invalid");
    expect(code({ dateOfBirth: "2999-01-01" })).toBe("dob_future");
    expect(code({ dateOfBirth: "1990-02-31" })).toBe("dob_invalid");
    expect(code({ firstName: "" })).toBe("name_invalid");
  });

  it("sign-in only checks the PIN format (never hints at the trivial-PIN rule)", () => {
    const base = { firstName: "Omar", lastName: "Haddad", dateOfBirth: "1990-04-12" };
    expect(pinSignInSchema.safeParse({ ...base, pin: "1234" }).success).toBe(true);
    expect(pinSignInSchema.safeParse({ ...base, pin: "12" }).success).toBe(false);
  });

  it("change PIN: new must differ from old, twice the same, not trivial", () => {
    expect(changePinSchema.safeParse({ oldPin: "4821", newPin: "7391", newPinConfirm: "7391" }).success).toBe(true);
    expect(changePinSchema.safeParse({ oldPin: "4821", newPin: "4821", newPinConfirm: "4821" }).success).toBe(false);
    expect(changePinSchema.safeParse({ oldPin: "4821", newPin: "7391", newPinConfirm: "7392" }).success).toBe(false);
    expect(changePinSchema.safeParse({ oldPin: "4821", newPin: "1111", newPinConfirm: "1111" }).success).toBe(false);
  });

  it("every message exists in English and Arabic", () => {
    for (const [code, [en, ar]] of Object.entries(PIN_MESSAGES)) {
      expect(en.length, code).toBeGreaterThan(5);
      expect(/[؀-ۿ]/.test(ar), `${code} has Arabic`).toBe(true);
      expect(pinMessage(code, "en")).toBe(en);
      expect(pinMessage(code, "ar")).toBe(ar);
    }
  });
});

describe("password derivation", () => {
  it("is deterministic", () => {
    expect(derivePinPassword(USER_A, "4821", SECRET)).toBe(derivePinPassword(USER_A, "4821", SECRET));
  });

  it("differs per user, per PIN and per server secret", () => {
    const base = derivePinPassword(USER_A, "4821", SECRET);
    expect(derivePinPassword(USER_B, "4821", SECRET)).not.toBe(base);
    expect(derivePinPassword(USER_A, "4822", SECRET)).not.toBe(base);
    expect(derivePinPassword(USER_A, "4821", "another-secret")).not.toBe(base);
  });

  it("never equals the PIN and does not contain it; it is a long base64url string", () => {
    for (const pin of ["4821", "0000", "9999"]) {
      const pw = derivePinPassword(USER_A, pin, SECRET);
      expect(pw).not.toBe(pin);
      expect(pw.length).toBe(43);
      expect(pw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});

describe("generators", () => {
  it("temporary PINs are 4 digits and never trivial", () => {
    for (let i = 0; i < 500; i++) {
      const pin = generateTempPin();
      expect(pin).toMatch(/^\d{4}$/);
      expect(isTrivialPin(pin)).toBe(false);
    }
  });

  it("family PINs are 6 digits and vary", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pin = generateFamilyPin();
      expect(pin).toMatch(/^\d{6}$/);
      seen.add(pin);
    }
    expect(seen.size).toBeGreaterThan(150);
  });

  it("constantTimeEqual compares by value, whatever the length", () => {
    expect(constantTimeEqual("123456", "123456")).toBe(true);
    expect(constantTimeEqual("123456", "123457")).toBe(false);
    expect(constantTimeEqual("123456", "12345")).toBe(false);
  });

  it("members get a placeholder address that is never a real mailbox", () => {
    const e = memberEmail(USER_A);
    expect(e).toBe(`m-${USER_A}@${MEMBER_EMAIL_DOMAIN}`);
    expect(memberEmail()).not.toBe(memberEmail());
  });
});

describe("lockout logic (pure)", () => {
  const now = 1_000_000;
  it("5 failures in 15 minutes", () => {
    expect(PIN_MAX_FAILURES).toBe(5);
    expect(PIN_LOCK_MINUTES).toBe(15);
  });

  it("not locked while tries remain", () => {
    expect(lockState(5, now + 60_000, now)).toEqual({ locked: false, minutesLeft: 0 });
    expect(lockState(1, now + 60_000, now).locked).toBe(false);
  });

  it("locked at zero remaining, with whole minutes left (rounded up, at least 1)", () => {
    expect(lockState(0, now + 15 * 60_000, now)).toEqual({ locked: true, minutesLeft: 15 });
    expect(lockState(0, now + 61_000, now).minutesLeft).toBe(2);
    expect(lockState(0, now + 1_000, now).minutesLeft).toBe(1);
  });

  it("unlocks once the window has passed", () => {
    expect(lockState(0, now - 1, now).locked).toBe(false);
    expect(lockState(0, now, now).locked).toBe(false);
  });

  it("the fifth failure locks, the fourth does not", () => {
    expect(lockedAfterFailure(1)).toBe(false);
    expect(lockedAfterFailure(0)).toBe(true);
  });

  it("the account key is name + birthday", () => {
    expect(accountLockKey("omar haddad", "1990-04-12")).toBe("omar haddad|1990-04-12");
  });

  it("response time is padded to a floor so timing never reveals an account", () => {
    expect(remainingDelayMs(1000, 1100)).toBe(PIN_MIN_RESPONSE_MS - 100);
    expect(remainingDelayMs(1000, 1000 + PIN_MIN_RESPONSE_MS + 50)).toBe(0);
  });
});

describe("name normalisation", () => {
  it("English: case, spacing, hyphens and apostrophes", () => {
    expect(normaliseName("  Omar   HADDAD ")).toBe("omar haddad");
    expect(makeNameKey("Mary-Jane", "O'Brien")).toBe("mary jane o brien");
    expect(makeNameKey("OMAR", "haddad")).toBe(makeNameKey("omar", "Haddad"));
  });

  it("Arabic: alef, ya and ta marbuta variants, diacritics and tatweel are folded", () => {
    expect(normaliseName("أحمد")).toBe(normaliseName("احمد"));
    expect(normaliseName("إبراهيم")).toBe(normaliseName("ابراهيم"));
    expect(normaliseName("فاطمة")).toBe(normaliseName("فاطمه"));
    expect(normaliseName("مصطفى")).toBe(normaliseName("مصطفي"));
    expect(normaliseName("مُحَمَّد")).toBe(normaliseName("محمد"));
    expect(normaliseName("محـــمد")).toBe(normaliseName("محمد"));
  });

  it("first + last combine into one key with a single space", () => {
    expect(makeNameKey("عمر", "حداد")).toBe("عمر حداد");
    expect(makeNameKey(" Omar ", " Haddad ")).toBe("omar haddad");
  });
});

describe("duplicate-account rule", () => {
  it("recognises the unique-index violation", () => {
    expect(isDuplicateIdentityError({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_pin_identity_uidx"' })).toBe(true);
    expect(isDuplicateIdentityError({ message: "duplicate key ... profiles_pin_identity_uidx" })).toBe(true);
    expect(isDuplicateIdentityError({ code: "23505", message: "duplicate key on profiles" })).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isDuplicateIdentityError(null)).toBe(false);
    expect(isDuplicateIdentityError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isDuplicateIdentityError({ message: "Database error creating new user" })).toBe(false);
  });

  it("the friendly duplicate message points to sign-in or an admin", () => {
    expect(pinMessage("duplicate", "en")).toBe(
      "Someone with this name and birthday already has an account. Try signing in, or ask an admin.",
    );
  });
});

describe("generic sign-in error", () => {
  it("is exactly the agreed wording", () => {
    expect(pinMessage("generic_signin", "en")).toBe("Those details don't match. Check your name, birthday and PIN.");
    expect(pinMessage("locked", "en")).toBe("Too many tries — wait 15 minutes or ask an admin to reset your PIN");
  });

  it("does not hint at which of name, birthday or PIN was wrong", () => {
    const msg = pinMessage("generic_signin", "en").toLowerCase();
    expect(msg).not.toMatch(/no (such )?(account|user)|not found|doesn't exist|wrong pin|incorrect pin|unknown/);
  });

  it("an unknown code falls back to a safe message, not a raw error", () => {
    expect(pinMessage("anything-else", "en")).toBe(PIN_MESSAGES.failed[0]);
  });
});

describe("permission matrix: reset PIN and family PIN", () => {
  const callers: Caller[] = ["viewer", "editor", "admin", "super_admin"];
  const pinViewer: Target = { id: "v", role: "viewer", isSuperAdmin: false, loginMethod: "pin" };
  const pinEditor: Target = { id: "e", role: "editor", isSuperAdmin: false, loginMethod: "pin" };
  const pinAdmin: Target = { id: "a", role: "admin", isSuperAdmin: false, loginMethod: "pin" };
  const emailViewer: Target = { id: "m", role: "viewer", isSuperAdmin: false, loginMethod: "email" };
  const me = "me";

  it("reset_pin: admins and the owner only", () => {
    expect(callers.map((c) => can(c, "reset_pin"))).toEqual([false, false, true, true]);
  });

  it("family_pin: the owner only", () => {
    expect(callers.map((c) => can(c, "family_pin"))).toEqual([false, false, false, true]);
    expect(can(callerOf({ role: "admin", is_super_admin: false }), "family_pin")).toBe(false);
    expect(can(callerOf({ role: "admin", is_super_admin: true }), "family_pin")).toBe(true);
  });

  it("a normal admin may reset non-admin PIN members", () => {
    expect(canActOn("admin", me, "reset_pin", pinViewer).ok).toBe(true);
    expect(canActOn("admin", me, "reset_pin", pinEditor).ok).toBe(true);
  });

  it("only the owner may reset an admin's PIN", () => {
    expect(canActOn("admin", me, "reset_pin", pinAdmin)).toEqual({ ok: false, reason: "admin" });
    expect(canActOn("super_admin", me, "reset_pin", pinAdmin).ok).toBe(true);
  });

  it("viewers and editors may not reset anything", () => {
    expect(canActOn("viewer", me, "reset_pin", pinViewer).ok).toBe(false);
    expect(canActOn("editor", me, "reset_pin", pinViewer).ok).toBe(false);
  });

  it("email accounts have no PIN to reset; nobody resets their own here", () => {
    expect(canActOn("super_admin", me, "reset_pin", emailViewer)).toEqual({ ok: false, reason: "not_pin" });
    expect(canActOn("admin", me, "reset_pin", { ...pinViewer, id: me })).toEqual({ ok: false, reason: "self" });
    expect(canActOn("admin", me, "reset_pin", { id: "x", role: "viewer", isSuperAdmin: false })).toEqual({
      ok: false,
      reason: "not_pin",
    });
  });
});

describe("family PIN storage helper", () => {
  function fakeService() {
    const rows = new Map<string, { value: string }>();
    let upserts = 0;
    const svc = {
      from: () => ({
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => ({ data: rows.get(key) ?? null, error: null }),
          }),
        }),
        upsert: async (row: { key: string; value: string }, opts: { ignoreDuplicates?: boolean }) => {
          upserts++;
          if (!(opts.ignoreDuplicates && rows.has(row.key))) rows.set(row.key, { value: row.value });
          return { error: null };
        },
      }),
    };
    return { svc: svc as unknown as Parameters<typeof getOrCreateFamilyPin>[0], rows, upserts: () => upserts };
  }

  it("creates a 6-digit PIN on first read and returns the same one afterwards", async () => {
    const { svc, rows, upserts } = fakeService();
    const first = await getOrCreateFamilyPin(svc);
    expect(first).toMatch(/^\d{6}$/);
    expect(await getOrCreateFamilyPin(svc)).toBe(first);
    expect(rows.get("family_pin")?.value).toBe(first);
    expect(upserts()).toBe(1);
  });
});

describe("WhatsApp message", () => {
  it("is the agreed sentence with the site and the PIN", () => {
    expect(familyInviteMessage("123456", "en")).toBe(
      "Join our family tree: https://www.bigfatfamilytree.com.au — family PIN: 123456",
    );
    expect(familyInviteMessage("123456", "ar")).toContain("123456");
    expect(familyInviteMessage("123456", "ar")).toContain("https://www.bigfatfamilytree.com.au");
  });
});
