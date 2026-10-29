import "server-only";
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { isTrivialPin } from "@/lib/auth/pin-validation";

// Server-only crypto for PIN accounts. Nothing here ever logs, stores or
// returns a PIN except the two generators, whose output goes straight to an
// admin's screen once.

export const MEMBER_EMAIL_DOMAIN = "members.bigfatfamilytree.com.au";

/** The placeholder address of an account that has no email. Never shown or mailed. */
export function memberEmail(userId: string = randomUUID()): string {
  return `m-${userId}@${MEMBER_EMAIL_DOMAIN}`;
}

/**
 * The Supabase password of a PIN account:
 *   base64url(HMAC-SHA256(key, userId + ":" + pin)),  key = "bff-pin:" + SERVICE_ROLE_KEY
 * A 4-digit PIN is therefore never the stored password; guessing needs both the
 * server secret and the user id, and sign-in attempts are rate limited.
 * (Same idea as the approval-cookie HMAC in lib/auth/gate.ts, with its own label.)
 */
export function derivePinPassword(userId: string, pin: string, secret: string): string {
  return createHmac("sha256", `bff-pin:${secret}`).update(`${userId}:${pin}`).digest("base64url");
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** A random 6-digit family PIN (CSPRNG). */
export function generateFamilyPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** A random, non-trivial 4-digit temporary PIN (CSPRNG). */
export function generateTempPin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (!isTrivialPin(pin)) return pin;
  }
}
