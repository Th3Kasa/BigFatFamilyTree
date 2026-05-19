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
): Promise<ActionState> {
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
  const { error } = await supabase.from("relationships").insert({
    person_a_id: personId,
    person_b_id: otherPersonId,
    type: type as RelType,
    status: status as RelStatus,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${personId}`);
  return { success: true };
}

export async function deleteRelationship(
  relationshipId: string,
  personId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("relationships")
    .delete()
    .eq("id", relationshipId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  revalidatePath(`/person/${personId}`);
  return { success: true };
}
