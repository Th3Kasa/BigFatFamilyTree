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

  const spouseId = raw.spouse_id;
  if (spouseId && UUID_RE.test(spouseId)) {
    await supabase.from("relationships").insert({
      person_a_id: data.id,
      person_b_id: spouseId,
      type: "spouse",
      status: "current",
    });
  }

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
  if (parentId === childId) return { success: false, error: "A person cannot be their own parent." };
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

// ── updatePersonPhoto ─────────────────────────────────────────────────────────
// Lightweight photo-only update — bypasses the full personSchema so that
// inline avatar upload doesn't require all the other fields to be present.
export async function updatePersonPhoto(
  id: string,
  photoUrl: string | null,
): Promise<{ success: boolean; error?: string }> {
  if (photoUrl !== null && !/^https?:\/\//.test(photoUrl)) {
    return { success: false, error: "Invalid photo URL" };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("people")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("people")
    .update({ photo_url: photoUrl })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  const slug = (existing as { slug?: string | null } | null)?.slug;
  if (slug) revalidatePath(`/person/${slug}`);
  revalidatePath(`/person/${id}`);

  return { success: true };
}

// ── unlinkParent ──────────────────────────────────────────────────────────────
// Clears father_id or mother_id on the child (whichever currently points to parentId).
export async function unlinkParent(
  parentId: string,
  childId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: child } = await supabase
    .from("people")
    .select("father_id, mother_id, slug")
    .eq("id", childId)
    .maybeSingle();

  if (!child) return { success: false, error: "Child not found." };

  const ch = child as { father_id: string | null; mother_id: string | null; slug: string | null };
  const field =
    ch.father_id === parentId
      ? "father_id"
      : ch.mother_id === parentId
        ? "mother_id"
        : null;

  if (!field) return { success: false, error: "Parent link not found." };

  const { error } = await supabase
    .from("people")
    .update({ [field]: null })
    .eq("id", childId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  if (ch.slug) revalidatePath(`/person/${ch.slug}`);
  revalidatePath(`/person/${childId}`);
  return { success: true };
}

// ── convertParentToSpouse ─────────────────────────────────────────────────────
// One-shot: unlinks the parent-child relationship AND inserts a spouse rel.
// Used when a parent link was created by mistake and the two people are
// actually partners.
export async function convertParentToSpouse(
  parentId: string,
  childId: string,
): Promise<{ success: boolean; error?: string }> {
  if (parentId === childId) {
    return { success: false, error: "Cannot link a person to themselves." };
  }

  const supabase = await createClient();

  const { data: child } = await supabase
    .from("people")
    .select("father_id, mother_id, slug")
    .eq("id", childId)
    .maybeSingle();

  if (!child) return { success: false, error: "Person not found." };

  const ch = child as { father_id: string | null; mother_id: string | null; slug: string | null };
  const field =
    ch.father_id === parentId
      ? "father_id"
      : ch.mother_id === parentId
        ? "mother_id"
        : null;

  if (field) {
    const { error: unlinkErr } = await supabase
      .from("people")
      .update({ [field]: null })
      .eq("id", childId);
    if (unlinkErr) return { success: false, error: unlinkErr.message };
  }

  const { data: existing } = await supabase
    .from("relationships")
    .select("id")
    .eq("type", "spouse")
    .or(
      `and(person_a_id.eq.${parentId},person_b_id.eq.${childId}),and(person_a_id.eq.${childId},person_b_id.eq.${parentId})`,
    )
    .maybeSingle();

  if (!existing) {
    const { error: insertErr } = await supabase.from("relationships").insert({
      person_a_id: parentId,
      person_b_id: childId,
      type: "spouse",
      status: "current",
    });
    if (insertErr) return { success: false, error: insertErr.message };
  }

  revalidatePath("/");
  if (ch.slug) revalidatePath(`/person/${ch.slug}`);
  revalidatePath(`/person/${childId}`);
  revalidatePath(`/person/${parentId}`);
  return { success: true };
}

// ── linkSpouse ────────────────────────────────────────────────────────────────
// Creates a spouse relationship between two existing people. Idempotent.
// If a row already exists, updates its status when the caller's status differs.
export async function linkSpouse(
  personAId: string,
  personBId: string,
  status: "current" | "divorced" | "widowed" = "current",
): Promise<{ success: boolean; error?: string; relationshipId?: string }> {
  if (personAId === personBId) {
    return { success: false, error: "Cannot marry a person to themselves." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("relationships")
    .select("id, status")
    .eq("type", "spouse")
    .or(
      `and(person_a_id.eq.${personAId},person_b_id.eq.${personBId}),and(person_a_id.eq.${personBId},person_b_id.eq.${personAId})`,
    )
    .maybeSingle();

  if (existing) {
    const cur = existing as { id: string; status: string };
    if (cur.status !== status) {
      const { error: upErr } = await supabase
        .from("relationships")
        .update({ status })
        .eq("id", cur.id);
      if (upErr) return { success: false, error: upErr.message };
    }
    revalidatePath("/");
    return { success: true, relationshipId: cur.id };
  }

  const { data, error } = await supabase
    .from("relationships")
    .insert({
      person_a_id: personAId,
      person_b_id: personBId,
      type: "spouse",
      status,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  return { success: true, relationshipId: (data as { id: string }).id };
}

// ── linkAdopted ───────────────────────────────────────────────────────────────
// Records an adoptive parent → child relationship in the relationships table.
// Idempotent on the same parent/child pair.
export async function linkAdopted(
  parentId: string,
  childId: string,
): Promise<{ success: boolean; error?: string }> {
  if (parentId === childId) {
    return { success: false, error: "Cannot adopt yourself." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("relationships")
    .select("id")
    .eq("type", "adopted_by")
    .eq("person_a_id", childId)
    .eq("person_b_id", parentId)
    .maybeSingle();
  if (existing) {
    revalidatePath("/");
    return { success: true };
  }
  const { error } = await supabase.from("relationships").insert({
    person_a_id: childId,
    person_b_id: parentId,
    type: "adopted_by",
    status: "current",
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/");
  return { success: true };
}

// ── linkGuardian ──────────────────────────────────────────────────────────────
// Records a guardian/raised-by relationship.
export async function linkGuardian(
  guardianId: string,
  childId: string,
): Promise<{ success: boolean; error?: string }> {
  if (guardianId === childId) {
    return { success: false, error: "Cannot be your own guardian." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("relationships")
    .select("id")
    .eq("type", "raised_by")
    .eq("person_a_id", childId)
    .eq("person_b_id", guardianId)
    .maybeSingle();
  if (existing) {
    revalidatePath("/");
    return { success: true };
  }
  const { error } = await supabase.from("relationships").insert({
    person_a_id: childId,
    person_b_id: guardianId,
    type: "raised_by",
    status: "current",
  });
  if (error) return { success: false, error: error.message };
  revalidatePath("/");
  return { success: true };
}

// ── linkChild ─────────────────────────────────────────────────────────────────
// Sets parentId as the father_id or mother_id of childId, based on parent's
// gender. Idempotent.
export async function linkChild(
  parentId: string,
  childId: string,
): Promise<{ success: boolean; error?: string }> {
  if (parentId === childId) {
    return { success: false, error: "Cannot link a person to themselves." };
  }

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("people")
    .select("gender")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent) return { success: false, error: "Parent not found." };

  const field = (parent as { gender: string }).gender === "f" ? "mother_id" : "father_id";
  const { error } = await supabase
    .from("people")
    .update({ [field]: parentId })
    .eq("id", childId)
    .is("deleted_at", null);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  return { success: true };
}

// ── addSibling ────────────────────────────────────────────────────────────────
// Marks two people as siblings. Siblings are implicit through a shared parent,
// so this action either reuses an existing common parent or creates a
// placeholder parent and assigns both children.
//
// Resolution order (first match wins):
//   1. Already siblings → no-op, success
//   2. personA has a father/mother → copy that FK to personB
//   3. personB has a father/mother → copy that FK to personA
//   4. Neither has a parent → create a placeholder person and assign both as
//      father_id (since gender unknown, default to the father slot to keep
//      mother_id free for a future real mother).
export async function addSibling(
  personAId: string,
  personBId: string,
): Promise<{ success: boolean; error?: string; placeholderId?: string }> {
  if (personAId === personBId) {
    return { success: false, error: "Cannot link a person to themselves." };
  }

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("people")
    .select("id, father_id, mother_id, slug")
    .in("id", [personAId, personBId]);

  const records = (rows ?? []) as Array<{
    id: string;
    father_id: string | null;
    mother_id: string | null;
    slug: string | null;
  }>;
  const a = records.find((r) => r.id === personAId);
  const b = records.find((r) => r.id === personBId);
  if (!a || !b) return { success: false, error: "Person not found." };

  const shareFather =
    a.father_id && b.father_id && a.father_id === b.father_id;
  const shareMother =
    a.mother_id && b.mother_id && a.mother_id === b.mother_id;
  if (shareFather || shareMother) {
    return { success: true };
  }

  // Case 2: a has a parent → copy to b
  if (a.father_id && !b.father_id) {
    const { error } = await supabase
      .from("people")
      .update({ father_id: a.father_id })
      .eq("id", personBId);
    if (error) return { success: false, error: error.message };
  } else if (a.mother_id && !b.mother_id) {
    const { error } = await supabase
      .from("people")
      .update({ mother_id: a.mother_id })
      .eq("id", personBId);
    if (error) return { success: false, error: error.message };
  } else if (b.father_id && !a.father_id) {
    const { error } = await supabase
      .from("people")
      .update({ father_id: b.father_id })
      .eq("id", personAId);
    if (error) return { success: false, error: error.message };
  } else if (b.mother_id && !a.mother_id) {
    const { error } = await supabase
      .from("people")
      .update({ mother_id: b.mother_id })
      .eq("id", personAId);
    if (error) return { success: false, error: error.message };
  } else {
    // Case 4: neither has a free father slot → create a placeholder parent.
    const { data: placeholder, error: createErr } = await supabase
      .from("people")
      .insert({
        is_placeholder: true,
        gender: "unknown",
      })
      .select("id")
      .single();
    if (createErr || !placeholder) {
      return { success: false, error: createErr?.message ?? "Could not create placeholder parent." };
    }
    const phId = (placeholder as { id: string }).id;
    const { error: linkErr } = await supabase
      .from("people")
      .update({ father_id: phId })
      .in("id", [personAId, personBId]);
    if (linkErr) return { success: false, error: linkErr.message };
    revalidatePath("/");
    if (a.slug) revalidatePath(`/person/${a.slug}`);
    if (b.slug) revalidatePath(`/person/${b.slug}`);
    return { success: true, placeholderId: phId };
  }

  revalidatePath("/");
  if (a.slug) revalidatePath(`/person/${a.slug}`);
  if (b.slug) revalidatePath(`/person/${b.slug}`);
  return { success: true };
}

// ── deletePerson (soft delete) ────────────────────────────────────────────────
export async function deletePerson(id: string) {
  const supabase = await createClient();

  // Null out references from children so they don't point to a deleted person
  await Promise.all([
    supabase.from("people").update({ father_id: null }).eq("father_id", id).is("deleted_at", null),
    supabase.from("people").update({ mother_id: null }).eq("mother_id", id).is("deleted_at", null),
  ]);

  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  redirect("/");
}
