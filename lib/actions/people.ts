"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { personSchema } from "@/lib/validation/people";

export type ActionState = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  personId?: string;
} | null;

// ── createPerson ──────────────────────────────────────────────────────────────
export async function createPerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, v === "" ? null : v]),
  );
  // coerce boolean and nulls
  const parsed = personSchema.safeParse({
    ...raw,
    is_placeholder: raw.is_placeholder === "true",
    gender: raw.gender ?? "unknown",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${data.id}`);
  redirect(`/person/${data.id}`);
}

// ── updatePerson ──────────────────────────────────────────────────────────────
export async function updatePerson(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, v === "" ? null : v]),
  );
  const parsed = personSchema.safeParse({
    ...raw,
    is_placeholder: raw.is_placeholder === "true",
    gender: raw.gender ?? "unknown",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${id}`);
  redirect(`/person/${id}`);
}

// ── deletePerson (soft delete) ────────────────────────────────────────────────
export async function deletePerson(id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  redirect("/");
}
