import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  /** The owner account: may add/remove members and admins. */
  isSuperAdmin: boolean;
};

/**
 * Server-side admin gate for every admin action. RLS also protects the tables,
 * but we never rely on it alone: the caller's role is read from `profiles` on
 * every call. Returns null unless the caller is a signed-in admin.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin" && !profile?.is_super_admin) return null;

  return { supabase, userId: user.id, isSuperAdmin: !!profile?.is_super_admin };
}

/** Like getAdminContext(), but only for the super admin. Re-read from the database on every call. */
export async function getSuperAdminContext(): Promise<AdminContext | null> {
  const ctx = await getAdminContext();
  return ctx?.isSuperAdmin ? ctx : null;
}

export async function getSignedInUserId(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}
