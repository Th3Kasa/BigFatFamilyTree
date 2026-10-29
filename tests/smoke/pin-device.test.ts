import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  clearedDeviceCookieOptions,
  DEVICE_COOKIE,
  DEVICE_MAX_AGE_MS,
  DEVICE_MAX_AGE_SECONDS,
  deviceCookieOptions,
  deviceStatus,
  generateDeviceToken,
  hashDeviceToken,
  idsToEvict,
  isPlausibleToken,
  isUsablePinProfile,
  MAX_DEVICES_PER_PROFILE,
  userAgentHint,
  type DeviceRow,
} from "@/lib/auth/pin-device";

const NOW = Date.parse("2026-10-29T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const row = (id: string, ageDays: number): DeviceRow => ({ id, profile_id: "p1", last_used_at: daysAgo(ageDays) });

describe("device token", () => {
  it("is 32 random bytes as base64url (43 chars) and never repeats", () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
  });

  it("hashes to SHA-256 hex, deterministically, and the hash does not contain the token", () => {
    const t = generateDeviceToken();
    const h = hashDeviceToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDeviceToken(t)).toBe(h);
    expect(h).not.toContain(t);
    expect(hashDeviceToken(generateDeviceToken())).not.toBe(h);
    // Known vector: sha256("abc")
    expect(hashDeviceToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("rejects cookie values that are not tokens before they reach the database", () => {
    expect(isPlausibleToken(generateDeviceToken())).toBe(true);
    for (const bad of [undefined, null, "", "short", "x".repeat(44), "x".repeat(42) + "!", "' or 1=1 --" + "x".repeat(40)]) {
      expect(isPlausibleToken(bad as string | undefined)).toBe(false);
    }
  });
});

describe("device cookie flags", () => {
  it("is httpOnly, SameSite=Lax, Secure in production, site-wide, about a year", () => {
    expect(DEVICE_COOKIE).toBe("bff_device");
    expect(deviceCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    expect(DEVICE_MAX_AGE_SECONDS).toBe(31_536_000);
  });

  it("is only non-Secure outside production (plain-http local dev)", () => {
    expect(deviceCookieOptions(false).secure).toBe(false);
    expect(deviceCookieOptions(false).httpOnly).toBe(true);
  });

  it("the clearing cookie has the same attributes and no lifetime", () => {
    expect(clearedDeviceCookieOptions(true)).toEqual({ ...deviceCookieOptions(true), maxAge: 0 });
  });
});

describe("user agent hint", () => {
  it("is a coarse label, not the raw user agent", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const winChrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const androidChrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(userAgentHint(iphone)).toBe("iPhone Safari");
    expect(userAgentHint(winChrome)).toBe("Windows Chrome");
    expect(userAgentHint(androidChrome)).toBe("Android phone Chrome");
    expect(userAgentHint(null)).toBe("Computer browser");
    expect(userAgentHint(iphone)).not.toMatch(/\d{2,}/);
  });
});

describe("resolving a stored device", () => {
  it("unknown when no row matches the hash", () => {
    expect(deviceStatus(null, NOW)).toBe("unknown");
    expect(deviceStatus(undefined, NOW)).toBe("unknown");
  });
  it("valid within a year of last use, expired after", () => {
    expect(deviceStatus({ last_used_at: daysAgo(1) }, NOW)).toBe("valid");
    expect(deviceStatus({ last_used_at: new Date(NOW - DEVICE_MAX_AGE_MS + 1000).toISOString() }, NOW)).toBe("valid");
    expect(deviceStatus({ last_used_at: daysAgo(366) }, NOW)).toBe("expired");
    expect(deviceStatus({ last_used_at: "garbage" }, NOW)).toBe("expired");
  });
  it("only a PIN profile with a name key can be resolved (the birthday is optional)", () => {
    expect(isUsablePinProfile({ login_method: "pin", name_key: "a b", date_of_birth: "1990-01-01" })).toBe(true);
    expect(isUsablePinProfile({ login_method: "email", name_key: "a b", date_of_birth: "1990-01-01" })).toBe(false);
    expect(isUsablePinProfile({ login_method: "pin", name_key: null, date_of_birth: "1990-01-01" })).toBe(false);
    expect(isUsablePinProfile({ login_method: "pin", name_key: "a", date_of_birth: null })).toBe(true);
    expect(isUsablePinProfile(null)).toBe(false);
  });
});

describe("evicting past the cap", () => {
  it("keeps at most 10 per profile and drops the least recently used first", () => {
    expect(MAX_DEVICES_PER_PROFILE).toBe(10);
    const rows = Array.from({ length: 10 }, (_, i) => row(`d${i}`, 100 - i * 5)); // d0 oldest
    expect(idsToEvict(rows, "d9")).toEqual([]); // exactly at the cap
    const eleven = [...rows, row("new", 0)];
    expect(idsToEvict(eleven, "new")).toEqual(["d0"]);
    const thirteen = [...eleven, row("n2", 0), row("n3", 0)];
    expect(idsToEvict(thirteen, "n3")).toEqual(["d0", "d1", "d2"]);
  });

  it("never evicts the device just added, even if its timestamp is the oldest", () => {
    const rows = [row("fresh", 400), ...Array.from({ length: 10 }, (_, i) => row(`d${i}`, 50 - i))];
    const evicted = idsToEvict(rows, "fresh");
    expect(evicted).not.toContain("fresh");
    expect(evicted).toHaveLength(1);
  });

  it("is deterministic on equal timestamps", () => {
    const rows = ["b", "a", "c"].map((id) => ({ id, profile_id: "p", last_used_at: daysAgo(5) }));
    expect(idsToEvict(rows, "c", 2)).toEqual(["a"]);
  });
});

describe("migration 27 (pin_devices)", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260524000027_pin_devices.sql"), "utf8");
  it("is service-role only: RLS on, no policies, nothing for anon/authenticated", () => {
    expect(sql).toMatch(/alter table public\.pin_devices enable row level security/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/revoke all on public\.pin_devices from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant [^;]*to (anon|authenticated)/i);
  });
  it("cascades with the profile and stores a hash and a coarse hint, no IP", () => {
    expect(sql).toMatch(/profile_id\s+uuid not null references public\.profiles\(id\) on delete cascade/);
    expect(sql).toMatch(/token_hash\s+text not null/);
    expect(sql).toMatch(/user_agent_hint/);
    expect(sql.replace(/--.*$/gm, "")).not.toMatch(/\bip\b|inet/i);
    expect(sql).toMatch(/unique index[^;]*token_hash/);
  });
});