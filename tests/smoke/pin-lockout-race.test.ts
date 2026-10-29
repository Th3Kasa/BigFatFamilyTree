import { describe, it, expect, vi, beforeEach } from "vitest";

// Behaviour of signInWithPin's per-account lock with an in-memory, atomic
// limiter (like Upstash's limit()). Every sign-in fails (wrong PIN).

const counters = new Map<string, number>();
const LIMITS: Record<string, number> = { pinIp: 1_000, pinFail: 5, pinFailDay: 10, familyPin: 10 };
const signInCalls = { n: 0 };
const audits: unknown[] = [];

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", `10.0.0.${Math.floor(Math.random() * 250)}`]]),
}));
vi.mock("@/lib/env", () => ({
  env: () => ({ SUPABASE_SERVICE_ROLE_KEY: "test-secret", NEXT_PUBLIC_SUPABASE_URL: "x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "y" }),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkLimitStrict: async (key: string, id: string) => {
    const k = `${key}:${id}`;
    const used = (counters.get(k) ?? 0) + 1;
    counters.set(k, used);
    return { success: used <= LIMITS[key], unavailable: false, reset: Date.now() + 60_000, remaining: Math.max(0, LIMITS[key] - used) };
  },
  resetLimit: async (key: string, id: string) => {
    counters.delete(`${key}:${id}`);
  },
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111" } }) };
      return q;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "m-x@members.bigfatfamilytree.com.au" } } }) } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () => {
        signInCalls.n++;
        return { error: { status: 400, message: "Invalid login credentials" } };
      },
    },
  }),
}));
vi.mock("@/lib/members/account-admin", () => ({ writeAudit: async (e: unknown) => void audits.push(e) }));
vi.mock("@/lib/auth/family-pin", () => ({ getOrCreateFamilyPin: async () => "123456" }));
vi.mock("@/lib/auth/pin-lockout", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/pin-lockout")>()),
  remainingDelayMs: () => 0,
}));

const input = { firstName: "Omar", lastName: "Haddad", dateOfBirth: "1990-04-12", pin: "4821" };

describe("PIN lockout under parallel attempts", () => {
  beforeEach(() => {
    counters.clear();
    signInCalls.n = 0;
    audits.length = 0;
  });

  it("50 simultaneous guesses from many IPs reach Supabase at most 5 times", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    const results = await Promise.all(Array.from({ length: 50 }, () => signInWithPin(input, "en")));
    expect(signInCalls.n).toBe(5);
    expect(results.filter((r) => !r.ok && r.code === "locked").length).toBe(46);
  });

  it("name variants (case, spacing) share one lock", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    const variants = ["omar", "OMAR", " Omar ", "oMaR", "Omar"];
    for (const v of variants) await signInWithPin({ ...input, firstName: v }, "en");
    const r = await signInWithPin({ ...input, firstName: "OmAr" }, "en");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("locked");
    expect(signInCalls.n).toBe(5);
  });

  it("after 10 tries in a day the account stays locked even when the 15-minute window resets, and admins are told", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    for (let i = 0; i < 5; i++) await signInWithPin(input, "en");
    for (const k of [...counters.keys()]) if (k.startsWith("pinFail:")) counters.delete(k); // 15 minutes pass
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await signInWithPin(input, "en"));
    expect(signInCalls.n).toBe(10);
    expect(results.at(-2)).toMatchObject({ ok: false, code: "locked_day" });
    for (const k of [...counters.keys()]) if (k.startsWith("pinFail:")) counters.delete(k); // another 15 minutes
    expect(await signInWithPin(input, "en")).toMatchObject({ ok: false, code: "locked_day" });
    expect(signInCalls.n).toBe(10);
    expect(audits).toEqual([expect.objectContaining({ after: { event: "pin_locked_24h" } })]);
  });
});
