import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// BOOTSTRAP_ADMIN_CREDENTIALS exists to create the FIRST admin of a fresh
// install. Once any admin exists it does nothing: it never re-promotes anyone
// on a later sign-in and never resets a password.

/** The one message every bootstrap failure shows, so nothing about the allowlist or accounts leaks. */
export const BOOTSTRAP_FAILED = "Sign-in failed";

type Svc = ReturnType<typeof createServiceClient>;

/** How many admins exist; null if that could not be read (treated as "not zero", so nothing is promoted). */
export async function countAdmins(svc: Svc): Promise<number | null> {
  const { count, error } = await svc
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  return error ? null : (count ?? 0);
}

/** Make this user the first admin, but only while there are zero admins. Returns true if it promoted. */
export async function promoteIfNoAdmins(svc: Svc, userId: string): Promise<boolean> {
  if ((await countAdmins(svc)) !== 0) return false;
  const { error } = await svc
    .from("profiles")
    .upsert({ id: userId, role: "admin", approved_at: new Date().toISOString() }, { onConflict: "id" });
  return !error;
}
