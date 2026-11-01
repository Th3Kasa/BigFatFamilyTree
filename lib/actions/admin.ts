"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleUpdateSchema } from "@/lib/validation/admin";
import { canBecomeAdmin, NEEDS_EMAIL_FOR_ADMIN } from "@/lib/members/account-admin";

export type AdminActionState = {
  success: boolean;
  error?: string;
} | null;

export async function updateUserRole(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = roleUpdateSchema.safeParse({
    userId: formData.get("userId")?.toString(),
    role: formData.get("role")?.toString(),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: caller } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (caller?.role !== "admin") {
    return { success: false, error: "Forbidden." };
  }

  // Admins sign in by email, so an account with only a PIN can't become one.
  if (parsed.data.role === "admin" && !(await canBecomeAdmin(parsed.data.userId))) {
    return { success: false, error: NEEDS_EMAIL_FOR_ADMIN.en };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  return { success: true };
}
