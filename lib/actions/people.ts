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

  // Keep existing slug — don't regenerate on edit
  const { data: existing } = await supabase
    .from("people")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  const existingSlug = (existing as { slug?: string | null } | null)?.slug ?? null;

  // Build update payload excluding undefined keys (so optional fields aren't nulled out)
  const raw2 = parseFormData(formData);
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    // Only include nullable fields if user actually submitted them
    if (v === null && !(k in raw2)) continue;
    payload[k] = v;
  }

  const { error } = await supabase
    .from("people")
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${existingSlug ?? id}`);
  redirect(`/person/${existingSlug ?? id}`);
}

// ── createPersonQuick ─────────────────────────────────────────────────────────
// Like createPerson but no redirect — stays on canvas. Optionally wires
// spouse relationship or parent-child link based on hidden form fields.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createPersonQuick(
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
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  const newId = data.id;

  const spouseId = raw.spouse_id;
  if (spouseId && UUID_RE.test(spouseId)) {
    await supabase.from("relationships").insert({
      person_a_id: newId,
      person_b_id: spouseId,
      type: "spouse",
      status: "current",
    });
  }

  const childId = raw.child_id;
  if (childId && UUID_RE.test(childId)) {
    const field = parsed.data.gender === "f" ? "mother_id" : "father_id";
    await supabase.from("people").update({ [field]: newId }).eq("id", childId).is("deleted_at", null);
  }

  revalidatePath("/");
  return { success: true, personId: newId };
}

// ── linkParentChild ────────────────────────────────────────────────────────────
// Used when dragging a connection from a parent node's bottom handle to a
// child node's top handle on the canvas.
export async function linkParentChild(parentId: string, childId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: parent } = await supabase
    .from("people")
    .select("gender")
    .eq("id", parentId)
    .maybeSingle();

  if (!parent) return { success: false, error: "Parent not found." };

  const field = parent.gender === "f" ? "mother_id" : "father_id";
  const { error } = await supabase
    .from("people")
    .update({ [field]: parentId })
    .eq("id", childId)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  return { success: true };
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
