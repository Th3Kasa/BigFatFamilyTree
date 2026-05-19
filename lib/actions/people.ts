"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { personSchema } from "@/lib/validation/people";
import { generateSlug } from "@/lib/utils/slug";

export type ActionState = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  personId?: string;
} | null;

function parseFormData(formData: FormData): Record<string, string | null> {
  return Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [
      k,
      v instanceof File ? null : v === "" ? null : v,
    ]),
  );
}

async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = base;
  let n = 2;
  while (true) {
    const q = supabase.from("people").select("id").eq("slug", candidate);
    if (excludeId) q.neq("id", excludeId);
    const { data } = await q.maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${n++}`;
  }
}

// ── createPerson ──────────────────────────────────────────────────────────────
export async function createPerson(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = parseFormData(formData);
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
  const baseSlug = generateSlug(parsed.data.given_en, parsed.data.family_name_en, parsed.data.given_ar);
  const slug = await uniqueSlug(supabase, baseSlug);

  const { data, error } = await supabase
    .from("people")
    .insert({ ...parsed.data, slug })
    .select("id, slug")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  redirect(`/person/${data.slug ?? data.id}`);
}

// ── updatePerson ──────────────────────────────────────────────────────────────
export async function updatePerson(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = parseFormData(formData);
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
  const baseSlug = generateSlug(parsed.data.given_en, parsed.data.family_name_en, parsed.data.given_ar);
  const slug = await uniqueSlug(supabase, baseSlug, id);

  const { error } = await supabase
    .from("people")
    .update({ ...parsed.data, slug })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${slug}`);
  redirect(`/person/${slug}`);
}

// ── deletePerson (soft delete) ────────────────────────────────────────────────
export async function deletePerson(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  redirect("/");
}
