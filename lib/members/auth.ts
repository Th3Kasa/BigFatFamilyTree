import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
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
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return null;

  return { supabase, userId: user.id };
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
