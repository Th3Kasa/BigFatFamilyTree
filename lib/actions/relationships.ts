"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/actions/people";

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

  const validTypes = ["spouse", "adopted_by", "raised_by", "godparent"] as const;
  const validStatuses = ["current", "divorced", "widowed"] as const;

  if (!validTypes.includes(type as (typeof validTypes)[number])) {
    return { success: false, error: "Invalid relationship type." };
  }
  if (!validStatuses.includes(status as (typeof validStatuses)[number])) {
    return { success: false, error: "Invalid relationship status." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("relationships").insert({
    person_a_id: personId,
    person_b_id: otherPersonId,
    type: type as (typeof validTypes)[number],
    status: status as (typeof validStatuses)[number],
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
