import "server-only";
import { createHash, createHmac } from "node:crypto";
import { constantTimeEqual } from "@/lib/auth/pin-crypto";

// The join form checks the family PIN first, on its own step. A right answer
// returns a short-lived ticket so the later steps (name check, join) do not
// send the family PIN again or spend more of the per-IP family-PIN budget:
//
//   ticket = "<expiresAtMs>.<base64url(HMAC-SHA256(key, expiresAtMs ":" sha256(familyPin)))>"
//   key    = "bff-join:" + SUPABASE_SERVICE_ROLE_KEY
//
// The ticket is bound to the CURRENT family PIN, so making a new family PIN
// voids every ticket in flight. It proves only "knew the family PIN in the
// last half hour", the same thing the family PIN itself proves.

export const JOIN_TICKET_TTL_MS = 30 * 60 * 1000;

const mac = (expiresAt: number, familyPin: string, secret: string) =>
  createHmac("sha256", `bff-join:${secret}`)
    .update(`${expiresAt}:${createHash("sha256").update(familyPin).digest("hex")}`)
    .digest("base64url");

export function issueJoinTicket(familyPin: string, secret: string, now: number = Date.now()): string {
  const expiresAt = now + JOIN_TICKET_TTL_MS;
  return `${expiresAt}.${mac(expiresAt, familyPin, secret)}`;
}

/** Valid, unexpired and made with the current family PIN. */
export function verifyJoinTicket(ticket: string, familyPin: string, secret: string, now: number = Date.now()): boolean {
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(ticket);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now || expiresAt > now + JOIN_TICKET_TTL_MS) return false;
  return constantTimeEqual(match[2], mac(expiresAt, familyPin, secret));
}
