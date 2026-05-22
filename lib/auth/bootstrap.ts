// Emails auto-provisioned as admin even when Supabase signups are disabled.
// Used by the login server action (pre-creates auth.users via service-role)
// and by the auth callback (upserts profiles role on first sign-in).
export const BOOTSTRAP_ADMIN_EMAILS = new Set<string>([
  "nadir@evosion.com.au",
  "basemmorkos98@gmail.com",
]);

// Convenience password for bootstrap admins so the owner can skip the magic
// link flow during initial setup. WARNING: this repo is public; rotate via
// the Supabase dashboard once you're in.
export const BOOTSTRAP_ADMIN_PASSWORDS: Record<string, string> = {
  "nadir@evosion.com.au": "Evosion",
  "basemmorkos98@gmail.com": "BigFatFamily2026!",
};

export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return BOOTSTRAP_ADMIN_EMAILS.has(email.toLowerCase().trim());
}

export function bootstrapPasswordFor(email: string | null | undefined): string | null {
  if (!email) return null;
  return BOOTSTRAP_ADMIN_PASSWORDS[email.toLowerCase().trim()] ?? null;
}
