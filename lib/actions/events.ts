"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validation/events";
import type { ActionState } from "@/lib/actions/people";

export async function createEvent(
  personId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { id?: string }> {
  const raw = {
    type: formData.get("type")?.toString(),
    custom_label: formData.get("custom_label")?.toString(),
    date_value: formData.get("date_value")?.toString(),
    date_precision: formData.get("date_precision")?.toString() ?? "exact",
    location: formData.get("location")?.toString(),
    story_en: formData.get("story_en")?.toString(),
    story_ar: formData.get("story_ar")?.toString(),
  };

  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("events")
    .insert({
      person_id: personId,
      ...parsed.data,
      source_type: "family_contribution",
      contributed_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath(`/person/${personId}`);
  return { success: true, id: data.id };
}

export async function deleteEvent(
  eventId: string,
  personId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/person/${personId}`);
  return { success: true };
}
