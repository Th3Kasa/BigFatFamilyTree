// Edge-safe helpers for the "approved family only" gate in middleware.ts:
// the routing decision (pure) and a short-lived signed cookie that remembers
// "this user is approved" so the profile is looked up at most once per window.
//
// The cookie is a convenience for routing only. Data stays protected by RLS
// (public.is_approved()), so a stale cookie can never expose anything.

/** Routes an unapproved, signed-in user may still open. */
const UNAPPROVED_ALLOWED_PREFIXES = ["/welcome", "/login", "/update-password", "/auth", "/api/auth", "/_next"];

const STATIC_FILE_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|css|js|map|webmanifest|txt|xml)$/i;

/** Static files bypass auth entirely (no Supabase calls at all). */
export function isStaticFile(pathname: string): boolean {
  return STATIC_FILE_EXT.test(pathname) || pathname === "/favicon.ico";
}

/** Does this path need the caller to be approved? (Only asked for signed-in users.) */
export function requiresApproval(pathname: string): boolean {
  if (isStaticFile(pathname)) return false;
  return !UNAPPROVED_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export type AccessDecision =
  | { kind: "allow" }
  | { kind: "login"; next: string }
  | { kind: "welcome" };

/**
 * @param isPublic  the path is open to signed-out visitors (isPublicPath)
 * @param approved  only read when signedIn and requiresApproval(pathname);
 *                  null means "could not find out" and fails open (RLS still gates the data)
 */
export function decideAccess(input: {
  pathname: string;
  search?: string;
  isPublic: boolean;
  signedIn: boolean;
  approved: boolean | null;
}): AccessDecision {
  const { pathname, isPublic, signedIn, approved } = input;
  if (!signedIn) {
    if (isPublic) return { kind: "allow" };
    return { kind: "login", next: `${pathname}${input.search ?? ""}` };
  }
  if (!requiresApproval(pathname)) return { kind: "allow" };
  if (approved === false) return { kind: "welcome" };
  return { kind: "allow" };
}

// ── signed "approved" cookie ────────────────────────────────────────────────

export const APPROVAL_COOKIE = "bff-approved";
export const APPROVAL_TTL_SECONDS = 300;

const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(`bff-approval:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** `<userId>.<expiresAtSeconds>.<signature>` */
export async function signApproval(
  userId: string,
  secret: string,
  nowMs: number = Date.now(),
  ttlSeconds: number = APPROVAL_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload = `${userId}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${toB64Url(new Uint8Array(sig))}`;
}

/** True only for an unexpired cookie that was signed for exactly this user. */
export async function verifyApproval(
  cookie: string | undefined,
  userId: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!cookie) return false;
  const parts = cookie.split(".");
  if (parts.length !== 3) return false;
  const [uid, expRaw, sig] = parts;
  if (uid !== userId) return false;
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp * 1000 < nowMs) return false;
  const sigBytes = fromB64Url(sig);
  if (!sigBytes) return false;
  // subtle.verify compares in constant time.
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sigBytes as BufferSource,
    enc.encode(`${uid}.${exp}`),
  );
}
