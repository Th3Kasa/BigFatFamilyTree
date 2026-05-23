"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/actions/people";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TYPES = ["spouse", "adopted_by", "raised_by", "godparent"] as const;
const VALID_STATUSES = ["current", "divorced", "widowed"] as const;
type RelType = (typeof VALID_TYPES)[number];
type RelStatus = (typeof VALID_STATUSES)[number];

export async function createRelationship(
  personId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { id?: string }> {
  const otherPersonId = formData.get("other_person_id")?.toString()?.trim();
  const type = formData.get("type")?.toString();
  const status = formData.get("status")?.toString();

  if (!otherPersonId || !type || !status) {
    return { success: false, error: "All fields are required." };
  }

  if (!UUID_RE.test(otherPersonId)) {
    return { success: false, error: "Invalid person ID." };
  }

  if (!VALID_TYPES.includes(type as RelType)) {
    return { success: false, error: "Invalid relationship type." };
  }
  if (!VALID_STATUSES.includes(status as RelStatus)) {
    return { success: false, error: "Invalid relationship status." };
  }

  const supabase = await createClient();

  // Idempotency: return success if the relationship already exists (either direction).
  const { data: dup } = await supabase
    .from("relationships")
    .select("id")
    .eq("type", type as RelType)
    .or(
      `and(person_a_id.eq.${personId},person_b_id.eq.${otherPersonId}),and(person_a_id.eq.${otherPersonId},person_b_id.eq.${personId})`,
    )
    .maybeSingle();
  if (dup) {
    revalidatePath("/");
    revalidatePath(`/person/${personId}`);
    return { success: true, id: (dup as { id: string }).id };
  }

  const { data, error } = await supabase.from("relationships").insert({
    person_a_id: personId,
    person_b_id: otherPersonId,
    type: type as RelType,
    status: status as RelStatus,
  }).select("id").single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${personId}`);
  return { success: true, id: data.id };
}

export async function deleteRelationship(
  relationshipId: string,
  personId: string,
): Promise<ActionState> {
  const supabase = await createClient();

  // Fetch both parties before deleting so we can revalidate both profiles.
  const { data: rel } = await supabase
    .from("relationships")
    .select("person_a_id, person_b_id")
    .eq("id", relationshipId)
    .maybeSingle();

  const { error } = await supabase
    .from("relationships")
    .delete()
    .eq("id", relationshipId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  if (rel) {
    revalidatePath(`/person/${(rel as { person_a_id: string }).person_a_id}`);
    revalidatePath(`/person/${(rel as { person_b_id: string }).person_b_id}`);
  } else {
    revalidatePath(`/person/${personId}`);
  }
  return { success: true };
}

export async function updateRelationshipStatus(
  relationshipId: string,
  status: RelStatus,
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, error: "Invalid status." };
  }

  const supabase = await createClient();

  const { data: rel } = await supabase
    .from("relationships")
    .select("person_a_id, person_b_id")
    .eq("id", relationshipId)
    .maybeSingle();

  const { error } = await supabase
    .from("relationships")
    .update({ status })
    .eq("id", relationshipId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  if (rel) {
    revalidatePath(`/person/${(rel as { person_a_id: string }).person_a_id}`);
    revalidatePath(`/person/${(rel as { person_b_id: string }).person_b_id}`);
  }
  return { success: true };
}
