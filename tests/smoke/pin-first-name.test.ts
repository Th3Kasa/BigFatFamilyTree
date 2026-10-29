import { describe, it, expect, vi, beforeEach } from "vitest";
import { derivePinPassword } from "@/lib/auth/pin-crypto";
import { resolvePinCandidates, type PinCandidate } from "@/lib/auth/pin-resolve";
import { pinSignInSchema } from "@/lib/auth/pin-validation";

// New-device sign-in by first name + PIN, against an in-memory account list and
// an atomic in-memory limiter. Real code under test: pin-session.ts, pin-resolve.ts.

const SECRET = "test-secret";
const GOOD_PIN = "4821";
const emailOf = (id: string) => `m-${id}@members.bigfatfamilytree.com.au`;

type P = PinCandidate & { first_name: string; last_name: string; login_method: "pin" };
const person = (id: string, first: string, last: string, dob: string): P => ({
  id,
  first_name: first,
  last_name: last,
  name_key: `${first} ${last}`.toLowerCase(),
  date_of_birth: dob,
  login_method: "pin",
});
const PEOPLE: P[] = [
  person("a1", "Adel", "Mansour", "1980-01-01"),
  person("s1", "Samuel", "Nassif", "1970-05-05"),
  person("s2", "Samuel", "Khoury", "1990-02-02"),
  person("r1", "Rosa", "Haddad", "2000-01-01"),
  person("r2", "Rosa", "Nassif", "2000-01-01"),
];

const counters = new Map<string, number>();
const LIMITS: Record<string, number> = { pinIp: 10_000, pinFail: 5, pinFailDay: 10, pinFirst: 20, pinFirstDay: 50, familyPin: 10 };
const signInCalls = { n: 0 };
const pad = vi.fn((_a: number, _b: number) => 0);

vi.mock("next/headers", () => ({ headers: async () => new Map([["x-forwarded-for", "10.0.0.1"]]) }));
vi.mock("@/lib/env", () => ({
  env: () => ({ SUPABASE_SERVICE_ROLE_KEY: SECRET, NEXT_PUBLIC_SUPABASE_URL: "x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "y" }),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkLimitStrict: async (key: string, id: string) => {
    const k = `${key}:${id}`;
    const used = (counters.get(k) ?? 0) + 1;
    counters.set(k, used);
    return { success: used <= LIMITS[key], unavailable: false, reset: Date.now() + 60_000, remaining: Math.max(0, LIMITS[key] - used) };
  },
  resetLimit: async (key: string, id: string) => void counters.delete(`${key}:${id}`),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const filters: Array<(r: P) => boolean> = [];
      const q = {
        select: () => q,
        eq: (k: keyof P, v: unknown) => (filters.push((r) => r[k] === v), q),
        maybeSingle: async () => ({ data: PEOPLE.find((r) => filters.every((f) => f(r))) ?? null }),
        then: (res: (v: unknown) => unknown) => res({ data: PEOPLE.filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return q;
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: emailOf(id) } } }) } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        signInCalls.n++;
        const hit = PEOPLE.find((p) => emailOf(p.id) === email);
        return hit && password === derivePinPassword(hit.id, GOOD_PIN, SECRET)
          ? { error: null }
          : { error: { status: 400, message: "Invalid login credentials" } };
      },
    },
  }),
}));
vi.mock("@/lib/members/account-admin", () => ({ writeAudit: async () => undefined }));
vi.mock("@/lib/auth/family-pin", () => ({ getOrCreateFamilyPin: async () => "123456" }));
vi.mock("@/lib/auth/pin-device-store", () => ({
  clearDeviceCookie: async () => undefined,
  lookupRememberedDevice: async () => ({ state: "none" }),
  rememberDevice: async () => undefined,
  revokeDevices: async () => 0,
  touchDevice: async () => undefined,
}));
vi.mock("@/lib/auth/pin-lockout", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/pin-lockout")>()),
  remainingDelayMs: (a: number, b: number) => pad(a, b),
}));

const quick = (firstName: string, pin = GOOD_PIN, extra: Record<string, string> = {}) => ({ firstName, pin, ...extra });
const accountCounters = () => [...counters.keys()].filter((k) => k.startsWith("pinFail"));

beforeEach(() => {
  counters.clear();
  signInCalls.n = 0;
  pad.mockClear();
});

describe("resolving a first name (pure)", () => {
  it("one match, none, and the two kinds of ambiguity", () => {
    expect(resolvePinCandidates(PEOPLE, { firstName: " adel " })).toMatchObject({ kind: "one", profile: { id: "a1" } });
    expect(resolvePinCandidates(PEOPLE, { firstName: "Zed" })).toEqual({ kind: "none" });
    expect(resolvePinCandidates(PEOPLE, { firstName: "Samuel" })).toEqual({ kind: "need_birthday" });
    expect(resolvePinCandidates(PEOPLE, { firstName: "Samuel", dateOfBirth: "1990-02-02" })).toMatchObject({ kind: "one", profile: { id: "s2" } });
    expect(resolvePinCandidates(PEOPLE, { firstName: "Rosa", dateOfBirth: "2000-01-01" })).toEqual({ kind: "need_last_name" });
    expect(resolvePinCandidates(PEOPLE, { firstName: "Rosa", lastName: "Nassif", dateOfBirth: "2000-01-01" })).toMatchObject({ kind: "one", profile: { id: "r2" } });
  });
  it("a birthday given for a unique name must match", () => {
    expect(resolvePinCandidates(PEOPLE, { firstName: "Adel", dateOfBirth: "1999-09-09" })).toEqual({ kind: "none" });
  });
  it("sign-in accepts first name + PIN alone, and still the full form", () => {
    expect(pinSignInSchema.safeParse({ firstName: "Adel", pin: "4821" }).success).toBe(true);
    expect(pinSignInSchema.safeParse({ firstName: "Adel", lastName: "", dateOfBirth: "", pin: "4821" }).success).toBe(true);
    expect(pinSignInSchema.safeParse({ firstName: "Adel", lastName: "Mansour", dateOfBirth: "1980-01-01", pin: "4821" }).success).toBe(true);
    expect(pinSignInSchema.safeParse({ firstName: "Adel", dateOfBirth: "1980-02-31", pin: "4821" }).success).toBe(false);
    expect(pinSignInSchema.safeParse({ firstName: "", pin: "4821" }).success).toBe(false);
  });
});

describe("first name + PIN sign-in", () => {
  it("a unique first name signs in", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin(quick("adel"), "en")).toEqual({ ok: true, redirectTo: "/" });
    expect(signInCalls.n).toBe(1);
  });

  it("a wrong birthday for a unique name is a mismatch; the right one works", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin(quick("Adel", GOOD_PIN, { dateOfBirth: "1999-09-09" }), "en")).toMatchObject({ ok: false, code: "generic_signin" });
    expect(await signInWithPin(quick("Adel", GOOD_PIN, { dateOfBirth: "1980-01-01" }), "en")).toMatchObject({ ok: true });
  });

  it("an ambiguous name asks for the birthday WITHOUT trying any PIN or touching an account lock", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    const r = await signInWithPin(quick("Samuel"), "en");
    expect(r).toMatchObject({ ok: false, code: "need_birthday" });
    expect(r.ok === false && r.error).toBe("We need your birthday too, as more than one person has this name.");
    expect(signInCalls.n).toBe(0);
    expect(accountCounters()).toEqual([]);
  });

  it("ambiguous name + birthday signs in", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin(quick("Samuel", GOOD_PIN, { dateOfBirth: "1970-05-05" }), "en")).toMatchObject({ ok: true });
    expect(await signInWithPin(quick("Samuel", GOOD_PIN, { dateOfBirth: "1990-02-02" }), "en")).toMatchObject({ ok: true });
  });

  it("same first name and birthday asks for the last name (no PIN tried), then signs in", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin(quick("Rosa", GOOD_PIN, { dateOfBirth: "2000-01-01" }), "en")).toMatchObject({ ok: false, code: "need_last_name" });
    expect(signInCalls.n).toBe(0);
    expect(accountCounters()).toEqual([]);
    expect(await signInWithPin(quick("Rosa", GOOD_PIN, { dateOfBirth: "2000-01-01", lastName: "Haddad" }), "en")).toMatchObject({ ok: true });
  });

  it("no match gives the generic message after a dummy attempt", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin(quick("Zed"), "en")).toMatchObject({ ok: false, code: "generic_signin" });
    expect(signInCalls.n).toBe(1);
  });

  it("response-time padding runs on every path", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    const paths: Array<() => Promise<unknown>> = [
      () => signInWithPin(quick("Adel"), "en"), // success
      () => signInWithPin(quick("Adel", "9999"), "en"), // wrong PIN
      () => signInWithPin(quick("Zed"), "en"), // no match
      () => signInWithPin(quick("Samuel"), "en"), // need_birthday
      () => signInWithPin(quick("Rosa", GOOD_PIN, { dateOfBirth: "2000-01-01" }), "en"), // need_last_name
    ];
    for (const run of paths) {
      counters.clear();
      pad.mockClear();
      await run();
      expect(pad).toHaveBeenCalled();
    }
    // Refused by a limiter: also padded.
    counters.clear();
    for (let i = 0; i < 21; i++) await signInWithPin(quick("Samuel"), "en");
    pad.mockClear();
    expect(await signInWithPin(quick("Samuel"), "en")).toMatchObject({ ok: false, code: "locked" });
    expect(pad).toHaveBeenCalled();
  });
});

describe("limits on the first-name path", () => {
  it("20 tries / 15 minutes per first name, counted for need_birthday too, then refused", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    for (let i = 0; i < 20; i++) expect(await signInWithPin(quick("Samuel"), "en")).toMatchObject({ code: "need_birthday" });
    expect(await signInWithPin(quick("Samuel"), "en")).toMatchObject({ ok: false, code: "locked" });
    // Even with a good birthday and PIN, nothing reaches Supabase while it is limited.
    expect(await signInWithPin(quick("Samuel", GOOD_PIN, { dateOfBirth: "1970-05-05" }), "en")).toMatchObject({ ok: false, code: "locked" });
    expect(signInCalls.n).toBe(0);
    // Another first name has its own budget; spelling variants share this one.
    expect(await signInWithPin(quick("Adel"), "en")).toMatchObject({ ok: true });
    expect(await signInWithPin(quick("  SAMUEL "), "en")).toMatchObject({ ok: false, code: "locked" });
  });

  it("50 tries / day per first name", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    for (let i = 0; i < 50; i++) {
      for (const k of [...counters.keys()]) if (k.startsWith("pinFirst:")) counters.delete(k); // 15 minutes pass
      expect(await signInWithPin(quick("Samuel"), "en")).toMatchObject({ code: "need_birthday" });
    }
    for (const k of [...counters.keys()]) if (k.startsWith("pinFirst:")) counters.delete(k);
    expect(await signInWithPin(quick("Samuel"), "en")).toMatchObject({ ok: false, code: "locked_day" });
  });

  it("need_birthday never uses up an account's lockout", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    for (let i = 0; i < 10; i++) await signInWithPin(quick("Samuel"), "en");
    expect(accountCounters()).toEqual([]);
    expect(await signInWithPin(quick("Samuel", GOOD_PIN, { dateOfBirth: "1970-05-05" }), "en")).toMatchObject({ ok: true });
  });

  it("the account lockout is shared between first-name and full-form sign-ins", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    const full = (pin: string) => ({ firstName: "Adel", lastName: "Mansour", dateOfBirth: "1980-01-01", pin });
    await signInWithPin(quick("Adel", "1111"), "en");
    await signInWithPin(full("2222"), "en");
    await signInWithPin(quick("Adel", "3333"), "en");
    await signInWithPin(full("4444"), "en");
    expect(await signInWithPin(quick("Adel", "5555"), "en")).toMatchObject({ ok: false, code: "locked" });
    expect(signInCalls.n).toBe(5);
    expect(await signInWithPin(full(GOOD_PIN), "en")).toMatchObject({ ok: false, code: "locked" });
    expect(await signInWithPin(quick("Adel"), "en")).toMatchObject({ ok: false, code: "locked" });
    expect(signInCalls.n).toBe(5);
  });
});
