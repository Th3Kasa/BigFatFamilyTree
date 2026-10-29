// Pure rules for "remember this device" (no I/O, so they are trivially testable).
// The I/O half lives in lib/auth/pin-device-store.ts.
//
// Design: the browser holds a random 256-bit token in an httpOnly cookie. The
// server stores only the SHA-256 of it (table pin_devices), so a database leak
// yields nothing usable, and deleting the row revokes the device instantly.
// The cookie holds no name, birthday or profile id.

import { createHash, randomBytes } from "node:crypto";

export const DEVICE_COOKIE = "bff_device";
/** About one year. Refreshed every time the device is used. */
export const DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const DEVICE_MAX_AGE_MS = DEVICE_MAX_AGE_SECONDS * 1000;
/** Remembered devices per member; adding one more evicts the least recently used. */
export const MAX_DEVICES_PER_PROFILE = 10;

/** 32 random bytes as base64url: exactly 43 characters. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores. Lookup is by this hash, never by comparing raw tokens. */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check so garbage cookies never reach the database. */
export function isPlausibleToken(token: string | undefined | null): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export type DeviceCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

/**
 * httpOnly (no JavaScript can read it), SameSite=Lax, Secure everywhere except
 * plain-http local development (browsers refuse Secure cookies on http, except localhost).
 */
export function deviceCookieOptions(isProduction: boolean = process.env.NODE_ENV === "production"): DeviceCookieOptions {
  return { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: DEVICE_MAX_AGE_SECONDS };
}

/** Options that delete the cookie (same attributes, zero lifetime). */
export function clearedDeviceCookieOptions(isProduction: boolean = process.env.NODE_ENV === "production"): DeviceCookieOptions {
  return { ...deviceCookieOptions(isProduction), maxAge: 0 };
}

/**
 * A coarse, human label like "iPhone Safari". Deliberately NOT the raw user
 * agent (less identifying) and never an IP address.
 */
export function userAgentHint(ua: string | null | undefined): string {
  const s = ua ?? "";
  let device = "Computer";
  if (/iPad/i.test(s)) device = "iPad";
  else if (/iPhone|iPod/i.test(s)) device = "iPhone";
  else if (/Android/i.test(s)) device = /Mobile/i.test(s) ? "Android phone" : "Android tablet";
  else if (/Windows/i.test(s)) device = "Windows";
  else if (/Macintosh|Mac OS X/i.test(s)) device = "Mac";
  else if (/CrOS/i.test(s)) device = "Chromebook";
  else if (/Linux/i.test(s)) device = "Linux";

  let browser = "browser";
  if (/EdgiOS|EdgA|Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/SamsungBrowser/i.test(s)) browser = "Samsung Internet";
  else if (/FxiOS|Firefox/i.test(s)) browser = "Firefox";
  else if (/CriOS|Chrome\//i.test(s)) browser = "Chrome";
  else if (/Safari\//i.test(s)) browser = "Safari";
  return `${device} ${browser}`;
}

export type DeviceRow = { id: string; profile_id: string; last_used_at: string };

export type DeviceStatus = "valid" | "unknown" | "expired";

/** Is a stored row (found by token hash) still good? Expiry is rolling: a year after it was last used. */
export function deviceStatus(row: Pick<DeviceRow, "last_used_at"> | null | undefined, nowMs: number): DeviceStatus {
  if (!row) return "unknown";
  const last = Date.parse(row.last_used_at);
  if (Number.isNaN(last) || nowMs - last > DEVICE_MAX_AGE_MS) return "expired";
  return "valid";
}

/**
 * After adding a device, which of this profile's rows must go so that at most
 * `max` remain? Oldest `last_used_at` first; ties broken by id for determinism.
 * `rows` must include the row just added (it is never evicted).
 */
export function idsToEvict(rows: DeviceRow[], keepId: string, max: number = MAX_DEVICES_PER_PROFILE): string[] {
  const excess = rows.length - max;
  if (excess <= 0) return [];
  return rows
    .filter((r) => r.id !== keepId)
    .sort((a, b) => Date.parse(a.last_used_at) - Date.parse(b.last_used_at) || a.id.localeCompare(b.id))
    .slice(0, excess)
    .map((r) => r.id);
}

/** Only PIN accounts that still have an identity can be resolved from a device token. */
export function isUsablePinProfile(
  p: { login_method?: string | null; name_key?: string | null; date_of_birth?: string | null } | null | undefined,
): p is { login_method: "pin"; name_key: string; date_of_birth: string } {
  return !!p && p.login_method === "pin" && !!p.name_key && !!p.date_of_birth;
}
