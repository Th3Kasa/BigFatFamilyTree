// Bootstrap admins are auto-provisioned even when Supabase signups are
// disabled. Used by the login server action (pre-creates auth.users via
// service-role) and by the auth callback (upserts profiles role on first
// sign-in).
//
// Credentials come from the BOOTSTRAP_ADMIN_CREDENTIALS env var — never from
// source. Format: comma-separated entries of `email` or `email:password`.
//   BOOTSTRAP_ADMIN_CREDENTIALS="owner@example.com:s3cret,other@example.com"
// Entries without a password can only sign in via magic link.

function parseCredentials(): Map<string, string | null> {
  const raw = process.env.BOOTSTRAP_ADMIN_CREDENTIALS ?? "";
  const map = new Map<string, string | null>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) {
      map.set(trimmed.toLowerCase(), null);
    } else {
      const email = trimmed.slice(0, sep).trim().toLowerCase();
      const password = trimmed.slice(sep + 1);
      if (email) map.set(email, password || null);
    }
  }
  return map;
}

let cached: Map<string, string | null> | null = null;

function credentials(): Map<string, string | null> {
  if (!cached) cached = parseCredentials();
  return cached;
}

export function bootstrapAdminEmails(): Set<string> {
  return new Set(credentials().keys());
}

export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return credentials().has(email.toLowerCase().trim());
}

export function bootstrapPasswordFor(email: string | null | undefined): string | null {
  if (!email) return null;
  return credentials().get(email.toLowerCase().trim()) ?? null;
}
