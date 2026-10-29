import { describe, it, expect, vi, beforeEach } from "vitest";
import { derivePinPassword } from "@/lib/auth/pin-crypto";
import { generateDeviceToken, hashDeviceToken, DEVICE_COOKIE, MAX_DEVICES_PER_PROFILE } from "@/lib/auth/pin-device";

// The remember-this-device flow end to end, against an in-memory database,
// cookie jar and atomic rate limiter. Real code under test: pin-session.ts and
// pin-device-store.ts.

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "m-11111111@members.bigfatfamilytree.com.au";
const SECRET = "test-secret";
const GOOD_PIN = "4821";

type Row = Record<string, unknown>;
const db: { profiles: Row[]; pin_devices: Row[] } = { profiles: [], pin_devices: [] };
const jar = new Map<string, string>();
const cookieSets: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
const counters = new Map<string, number>();
const LIMITS: Record<string, number> = { pinIp: 1_000, pinFail: 5, pinFailDay: 10, familyPin: 10 };
const signInCalls = { n: 0 };
const audits: Array<{ after: Record<string, unknown> | null; actorId: string }> = [];
let clock = Date.parse("2026-10-29T00:00:00Z");
let userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function builder(table: "profiles" | "pin_devices") {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row = {};
  let returning = false;
  const filters: Array<(r: Row) => boolean> = [];
  const run = (single: boolean) => {
    const rows = db[table];
    let data: unknown;
    if (op === "insert") {
      clock += 1000;
      const row: Row = { id: `dev-${clock}`, created_at: new Date(clock).toISOString(), last_used_at: new Date(clock).toISOString(), ...payload };
      rows.push(row);
      data = single ? row : [row];
    } else {
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, payload));
      if (op === "delete") db[table] = rows.filter((r) => !hit.includes(r));
      data = single ? (hit[0] ?? null) : hit;
      if ((op === "update" || op === "delete") && !returning) data = null;
    }
    return Promise.resolve({ data, error: null });
  };
  const b = {
    select: () => ((returning = true), b),
    insert: (o: Row) => ((op = "insert"), (payload = o), b),
    update: (o: Row) => ((op = "update"), (payload = o), b),
    delete: () => ((op = "delete"), b),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    in: (k: string, a: unknown[]) => (filters.push((r) => a.includes(r[k])), b),
    maybeSingle: () => run(true),
    single: () => run(true),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run(false).then(res, rej),
  };
  return b;
}

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "10.0.0.1"], ["user-agent", userAgent]]),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieSets.push({ name, value, options });
      if (value === "" || options.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
  }),
}));
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
    from: (t: "profiles" | "pin_devices") => builder(t),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: EMAIL } } }) } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        signInCalls.n++;
        return email === EMAIL && password === derivePinPassword(PROFILE_ID, GOOD_PIN, SECRET)
          ? { error: null }
          : { error: { status: 400, message: "Invalid login credentials" } };
      },
    },
  }),
}));
vi.mock("@/lib/members/account-admin", () => ({ writeAudit: async (e: (typeof audits)[number]) => void audits.push(e) }));
vi.mock("@/lib/auth/family-pin", () => ({ getOrCreateFamilyPin: async () => "123456" }));
vi.mock("@/lib/auth/pin-lockout", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/pin-lockout")>()),
  remainingDelayMs: () => 0,
}));

const full = (pin: string) => ({ firstName: "Omar", lastName: "Haddad", dateOfBirth: "1990-04-12", pin });
const deviceRows = () => db.pin_devices.filter((r) => r.profile_id === PROFILE_ID);

beforeEach(() => {
  db.profiles = [
    { id: PROFILE_ID, login_method: "pin", name_key: "omar haddad", date_of_birth: "1990-04-12", first_name: "Omar", last_name: "Haddad" },
  ];
  db.pin_devices = [];
  jar.clear();
  cookieSets.length = 0;
  counters.clear();
  audits.length = 0;
  signInCalls.n = 0;
});

describe("remembering a device after a PIN sign-in", () => {
  it("sets an httpOnly SameSite=Lax cookie and stores only the token's hash", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin(full(GOOD_PIN), "en")).toMatchObject({ ok: true });

    const token = jar.get(DEVICE_COOKIE)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const set = cookieSets.find((c) => c.name === DEVICE_COOKIE)!;
    expect(set.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000 });
    // Nothing identifying in the cookie.
    expect(token.toLowerCase()).not.toContain("omar");
    expect(token).not.toContain("1990");
    expect(token).not.toContain(PROFILE_ID);

    expect(deviceRows()).toHaveLength(1);
    const stored = deviceRows()[0];
    expect(stored.token_hash).toBe(hashDeviceToken(token));
    expect(JSON.stringify(db.pin_devices)).not.toContain(token);
    expect(stored.user_agent_hint).toBe("iPhone Safari");
    expect(Object.keys(stored).join()).not.toMatch(/\bip\b|address/);

    const audit = audits.find((a) => a.after?.event === "pin_device_remembered");
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audits)).not.toContain(token);
  });

  it("a wrong PIN remembers nothing", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin(full("9999"), "en")).toMatchObject({ ok: false });
    expect(jar.has(DEVICE_COOKIE)).toBe(false);
    expect(deviceRows()).toHaveLength(0);
  });

  it("signing in again on the same device reuses its token instead of adding rows", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    await signInWithPin(full(GOOD_PIN), "en");
    const first = jar.get(DEVICE_COOKIE);
    await signInWithPin(full(GOOD_PIN), "en");
    expect(jar.get(DEVICE_COOKIE)).toBe(first);
    expect(deviceRows()).toHaveLength(1);
  });

  it("keeps at most 10 devices per profile and evicts the least recently used", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    const hashes: string[] = [];
    for (let i = 0; i < MAX_DEVICES_PER_PROFILE + 2; i++) {
      jar.clear(); // a different browser each time
      counters.clear();
      await signInWithPin(full(GOOD_PIN), "en");
      hashes.push(hashDeviceToken(jar.get(DEVICE_COOKIE)!));
    }
    const kept = deviceRows().map((r) => r.token_hash);
    expect(kept).toHaveLength(MAX_DEVICES_PER_PROFILE);
    expect(kept).not.toContain(hashes[0]);
    expect(kept).not.toContain(hashes[1]);
    expect(kept).toContain(hashes[11]);
  });
});

describe("PIN-only sign-in from a remembered device", () => {
  async function remembered() {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    await signInWithPin(full(GOOD_PIN), "en");
    counters.clear();
    signInCalls.n = 0;
    audits.length = 0;
  }

  it("resolves the member from the cookie and signs in with just the PIN", async () => {
    await remembered();
    const { lookupRememberedDevice } = await import("@/lib/auth/pin-device-store");
    const lookup = await lookupRememberedDevice();
    expect(lookup).toMatchObject({ state: "ok", device: { firstName: "Omar", initials: "OH" } });
    // The last name is not part of what the page receives.
    expect(JSON.stringify(lookup)).not.toContain("Haddad");

    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    expect(await signInWithDevice(GOOD_PIN, "en")).toEqual({ ok: true, redirectTo: "/" });
    expect(deviceRows()).toHaveLength(1);
  });

  it("a wrong PIN gets the same generic message as the full form", async () => {
    await remembered();
    const { signInWithDevice, signInWithPin } = await import("@/lib/auth/pin-session");
    const viaDevice = await signInWithDevice("9999", "en");
    counters.clear();
    const viaFull = await signInWithPin(full("9999"), "en");
    expect(viaDevice).toEqual(viaFull);
    expect(viaDevice).toMatchObject({ ok: false, code: "generic_signin" });
  });

  it("shares ONE lockout counter with the full form (5 tries total, either way)", async () => {
    await remembered();
    const { signInWithDevice, signInWithPin } = await import("@/lib/auth/pin-session");
    await signInWithPin(full("1111"), "en");
    await signInWithDevice("2222", "en");
    await signInWithPin(full("3333"), "en");
    await signInWithDevice("4444", "en");
    const fifth = await signInWithPin(full("5555"), "en");
    expect(fifth).toMatchObject({ ok: false, code: "locked" });
    expect(signInCalls.n).toBe(5);

    // Locked on both paths, even with the right PIN.
    expect(await signInWithDevice(GOOD_PIN, "en")).toMatchObject({ ok: false, code: "locked" });
    expect(await signInWithPin(full(GOOD_PIN), "en")).toMatchObject({ ok: false, code: "locked" });
    expect(signInCalls.n).toBe(5);
  });

  it("50 parallel PIN-only guesses reach Supabase at most 5 times", async () => {
    await remembered();
    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => signInWithDevice(String(1000 + i), "en")));
    expect(signInCalls.n).toBe(5);
    expect(results.filter((r) => !r.ok && r.code === "locked").length).toBe(46);
  });

  it("a correct PIN clears the counter for both paths", async () => {
    await remembered();
    const { signInWithDevice, signInWithPin } = await import("@/lib/auth/pin-session");
    for (const pin of ["1111", "2222", "3333"]) await signInWithDevice(pin, "en");
    expect(await signInWithDevice(GOOD_PIN, "en")).toMatchObject({ ok: true });
    for (const pin of ["1111", "2222", "3333", "4444"]) await signInWithPin(full(pin), "en");
    expect(await signInWithPin(full(GOOD_PIN), "en")).toMatchObject({ ok: true });
  });

  it("an unknown token clears the cookie and never reaches Supabase", async () => {
    jar.set(DEVICE_COOKIE, generateDeviceToken());
    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    expect(await signInWithDevice(GOOD_PIN, "en")).toMatchObject({ ok: false, code: "device_unknown" });
    expect(jar.has(DEVICE_COOKIE)).toBe(false);
    expect(signInCalls.n).toBe(0);
  });

  it("a revoked token behaves the same", async () => {
    await remembered();
    db.pin_devices = [];
    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    expect(await signInWithDevice(GOOD_PIN, "en")).toMatchObject({ ok: false, code: "device_unknown" });
    expect(jar.has(DEVICE_COOKIE)).toBe(false);
    expect(signInCalls.n).toBe(0);
  });

  it("an expired token (unused for over a year) is refused and cleared", async () => {
    await remembered();
    deviceRows()[0].last_used_at = new Date(clock - 400 * 86_400_000).toISOString();
    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    expect(await signInWithDevice(GOOD_PIN, "en")).toMatchObject({ ok: false, code: "device_unknown" });
    expect(jar.has(DEVICE_COOKIE)).toBe(false);
  });

  it("no cookie at all: device_unknown, nothing counted against the account", async () => {
    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    expect(await signInWithDevice(GOOD_PIN, "en")).toMatchObject({ ok: false, code: "device_unknown" });
    expect([...counters.keys()].some((k) => k.startsWith("pinFail"))).toBe(false);
  });

  it("a malformed PIN is rejected before anything is looked up", async () => {
    await remembered();
    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    expect(await signInWithDevice("12", "en")).toMatchObject({ ok: false, code: "pin_format" });
    expect(signInCalls.n).toBe(0);
  });

  it("a cookie that points at a non-PIN profile is treated as unknown", async () => {
    await remembered();
    db.profiles[0].login_method = "email";
    const { lookupRememberedDevice } = await import("@/lib/auth/pin-device-store");
    expect(await lookupRememberedDevice()).toEqual({ state: "stale" });
  });
});

describe("revoking", () => {
  it("revokeDevices deletes every device of that profile (only) and audits a count, never a token", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    for (let i = 0; i < 3; i++) {
      jar.clear();
      counters.clear();
      await signInWithPin(full(GOOD_PIN), "en");
    }
    const token = jar.get(DEVICE_COOKIE)!;
    db.pin_devices.push({ id: "other", profile_id: "someone-else", token_hash: "f".repeat(64), last_used_at: new Date(clock).toISOString() });
    audits.length = 0;

    const { revokeDevices } = await import("@/lib/auth/pin-device-store");
    expect(await revokeDevices("admin-1", PROFILE_ID, "pin_reset_by_admin")).toBe(3);
    expect(deviceRows()).toHaveLength(0);
    expect(db.pin_devices).toHaveLength(1);
    expect(audits).toEqual([
      expect.objectContaining({ actorId: "admin-1", after: { event: "pin_devices_revoked", count: 3, reason: "pin_reset_by_admin" } }),
    ]);
    expect(JSON.stringify(audits)).not.toContain(token);

    // Nothing to revoke: no audit noise.
    audits.length = 0;
    expect(await revokeDevices("admin-1", PROFILE_ID, "pin_reset_by_admin")).toBe(0);
    expect(audits).toHaveLength(0);
  });

  it("an old token no longer works after a revoke", async () => {
    const { signInWithPin, signInWithDevice } = await import("@/lib/auth/pin-session");
    await signInWithPin(full(GOOD_PIN), "en");
    const { revokeDevices } = await import("@/lib/auth/pin-device-store");
    await revokeDevices("admin-1", PROFILE_ID, "pin_reset_by_admin");
    counters.clear();
    expect(await signInWithDevice(GOOD_PIN, "en")).toMatchObject({ ok: false, code: "device_unknown" });
  });

  it("'Not you?' / sign-out forgets only this device and clears the cookie", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    await signInWithPin(full(GOOD_PIN), "en");
    const mine = jar.get(DEVICE_COOKIE)!;
    jar.clear();
    counters.clear();
    await signInWithPin(full(GOOD_PIN), "en"); // a second device
    expect(deviceRows()).toHaveLength(2);

    const { forgetCurrentDevice } = await import("@/lib/auth/pin-device-store");
    await forgetCurrentDevice();
    expect(jar.has(DEVICE_COOKIE)).toBe(false);
    expect(deviceRows()).toHaveLength(1);
    expect(deviceRows()[0].token_hash).toBe(hashDeviceToken(mine)); // the other device is untouched
  });
});
