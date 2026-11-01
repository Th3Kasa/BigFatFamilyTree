import { describe, it, expect, vi, beforeEach } from "vitest";
import { derivePinPassword } from "@/lib/auth/pin-crypto";
import { canSetUpPin } from "@/lib/auth/pin-setup";

// Admins and the owner sign in by email: their PIN is never tried, so a right
// PIN fails exactly like a wrong one. Real code under test: pin-session.ts.

const SECRET = "test-secret";
const PIN = "4821";
const placeholder = (id: string) => `m-${id}@members.bigfatfamilytree.com.au`;

type Row = { id: string; first_name: string; name_key: string; date_of_birth: string; login_method: "pin"; role: string; is_super_admin: boolean };
const ROWS: Row[] = [
  { id: "owner", first_name: "Basem", name_key: "basem morkos", date_of_birth: "1998-04-02", login_method: "pin", role: "admin", is_super_admin: true },
  { id: "member", first_name: "Mona", name_key: "mona haddad", date_of_birth: "1990-01-01", login_method: "pin", role: "editor", is_super_admin: false },
  { id: "pinadmin", first_name: "Fadi", name_key: "fadi saad", date_of_birth: "1970-01-01", login_method: "pin", role: "admin", is_super_admin: false },
];
const EMAILS: Record<string, string> = { owner: "owner@gmail.com", member: placeholder("member"), pinadmin: placeholder("pinadmin") };

const state = { profilesDown: false, device: null as null | { profileId: string } };
const counters = new Map<string, number>();
const refunds: string[] = [];
const signIns: string[] = [];
const cleared = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Map([["x-forwarded-for", "10.0.0.1"]]) }));
vi.mock("@/lib/env", () => ({
  env: () => ({ SUPABASE_SERVICE_ROLE_KEY: SECRET, NEXT_PUBLIC_SUPABASE_URL: "x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "y" }),
}));
vi.mock("@/lib/ratelimit", () => ({
  checkLimitStrict: async (key: string, id: string) => {
    const used = (counters.get(`${key}:${id}`) ?? 0) + 1;
    counters.set(`${key}:${id}`, used);
    return { success: true, unavailable: false, reset: 0, remaining: 100 };
  },
  refundLimit: async (key: string) => void refunds.push(key),
  resetLimit: async () => undefined,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const filters: Array<(r: Row) => boolean> = [];
      let roleRead = false;
      const q = {
        select: (cols: string) => ((roleRead = cols.includes("is_super_admin")), q),
        is: () => q,
        eq: (k: keyof Row, v: unknown) => (filters.push((r) => r[k] === v), q),
        maybeSingle: async () =>
          state.profilesDown && roleRead ? { data: null, error: { message: "down" } } : { data: ROWS.find((r) => filters.every((f) => f(r))) ?? null, error: null },
        then: (res: (v: unknown) => unknown) => res({ data: ROWS.filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return q;
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: EMAILS[id] } } }) } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        signIns.push(email);
        const hit = ROWS.find((r) => EMAILS[r.id] === email);
        return hit && password === derivePinPassword(hit.id, PIN, SECRET) ? { error: null } : { error: { status: 400, message: "Invalid login credentials" } };
      },
    },
  }),
}));
vi.mock("@/lib/members/account-admin", () => ({ writeAudit: async () => undefined }));
vi.mock("@/lib/auth/family-pin", () => ({ getOrCreateFamilyPin: async () => "123456" }));
vi.mock("@/lib/auth/pin-device-store", () => ({
  clearDeviceCookie: async () => cleared(),
  lookupRememberedDevice: async () =>
    state.device
      ? {
          state: "ok",
          device: { deviceId: "d1", profileId: state.device.profileId, nameKey: "basem morkos", dateOfBirth: "1998-04-02", firstName: "Basem", initials: "BM" },
        }
      : { state: "none" },
  rememberDevice: async () => undefined,
  revokeDevices: async () => 0,
  touchDevice: async () => undefined,
}));
vi.mock("@/lib/auth/pin-lockout", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/pin-lockout")>()),
  remainingDelayMs: () => 0,
}));

beforeEach(() => {
  counters.clear();
  refunds.length = 0;
  signIns.length = 0;
  cleared.mockClear();
  state.profilesDown = false;
  state.device = null;
});

describe("PIN sign-in for admins", () => {
  it("never tries the owner's PIN: the right PIN fails like a wrong one", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    const right = await signInWithPin({ firstName: "Basem", pin: PIN }, "en");
    const wrong = await signInWithPin({ firstName: "Basem", pin: "9184" }, "en");
    expect(right).toMatchObject({ ok: false, code: "generic_signin" });
    expect(wrong).toMatchObject({ ok: false, code: "generic_signin" });
    expect(signIns).not.toContain("owner@gmail.com");
  });

  it("still signs a regular member in with the right PIN", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin({ firstName: "Mona", pin: PIN }, "en")).toMatchObject({ ok: true });
  });

  it("lets an admin with no real email keep their PIN (nobody is locked out)", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    expect(await signInWithPin({ firstName: "Fadi", pin: PIN }, "en")).toMatchObject({ ok: true });
  });

  it("tries nothing, and gives the try back, if the role can't be read", async () => {
    const { signInWithPin } = await import("@/lib/auth/pin-session");
    state.profilesDown = true;
    expect(await signInWithPin({ firstName: "Basem", lastName: "Morkos", dateOfBirth: "1998-04-02", pin: PIN }, "en")).toMatchObject({
      ok: false,
      code: "busy",
    });
    expect(signIns).toHaveLength(0);
    expect(refunds.sort()).toEqual(["pinFail", "pinFailDay"]);
  });

  it("tells the owner's remembered phone to use email, and forgets the device", async () => {
    const { signInWithDevice } = await import("@/lib/auth/pin-session");
    state.device = { profileId: "owner" };
    expect(await signInWithDevice(PIN, "en")).toMatchObject({ ok: false, code: "admin_email_only" });
    expect(cleared).toHaveBeenCalled();
    expect(signIns).toHaveLength(0);
  });

  it("won't let an admin with a real email move to PIN sign-in", () => {
    expect(canSetUpPin({ sessionUserId: "owner", targetId: "owner", loginMethod: "email", email: "owner@gmail.com", isAdmin: true })).toMatchObject({
      ok: false,
      reason: "admin_email_only",
    });
  });
});
