// Emails auto-provisioned as admin even when Supabase signups are disabled.
// Used by the login server action (pre-creates auth.users via service-role)
// and by the auth callback (upserts profiles role on first sign-in).
export const BOOTSTRAP_ADMIN_EMAILS = new Set<string>([
  "nadir@evosion.com.au",
]);

export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return BOOTSTRAP_ADMIN_EMAILS.has(email.toLowerCase().trim());
}
