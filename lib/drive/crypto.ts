import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// The Google refresh token is stored encrypted (AES-256-GCM) with
// DRIVE_TOKEN_KEY, which lives only in the host's environment. A database
// leak alone is not enough to reach the Drive.

const PREFIX = "v1.";

export class BadKeyError extends Error {
  constructor() {
    super("DRIVE_TOKEN_KEY must be 32 bytes, base64 encoded.");
  }
}

function keyFrom(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new BadKeyError();
  return key;
}

export function encryptToken(plain: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyBase64), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptToken(stored: string, keyBase64: string): string {
  if (!stored.startsWith(PREFIX)) throw new Error("Unknown token format.");
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyBase64), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
