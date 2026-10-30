"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { eventSchema } from "@/lib/validation/events";
import type { ActionState } from "@/lib/actions/people";
import { OUT_OF_SCOPE, writeErrorMessage } from "@/lib/people/write-errors";

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
    photo_paths: parsePhotoPaths(formData.get("photo_paths")),
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
  if (parsed.data.type === "notable_story" && !parsed.data.story_en && !parsed.data.story_ar && parsed.data.photo_paths.length === 0) {
    return { success: false, error: "Write a few words or add a photo." };
  }
  // Photos only on memories, and only the author's own uploads (the database checks both too).
  if (parsed.data.photo_paths.length > 0) {
    if (parsed.data.type !== "notable_story") return { success: false, error: "Photos can only be added to a memory." };
    if (!parsed.data.photo_paths.every((p) => p.startsWith(`memories/${user.id}/`))) {
      return { success: false, error: "You can only add photos you uploaded yourself." };
    }
  }

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

  if (error) return { success: false, error: writeErrorMessage(error) };

  revalidatePath(`/person/${personId}`);
  return { success: true, id: data.id };
}

/** The hidden photo_paths field: a JSON array of storage paths (anything else counts as none). */
function parsePhotoPaths(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return null; // fails validation
  }
}

export async function deleteEvent(
  eventId: string,
  personId: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: removed, error } = await supabase.from("events").delete().eq("id", eventId).select("id, photo_paths");
  if (error) return { success: false, error: writeErrorMessage(error) };
  if (!removed || removed.length === 0) return { success: false, error: OUT_OF_SCOPE };
  // Best effort: remove the memory's photo files (storage lets members delete only their own uploads).
  const paths = (removed[0] as { photo_paths?: string[] | null }).photo_paths ?? [];
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from("photos").remove(paths);
    if (rmErr) console.error("[events] could not remove memory photos:", rmErr.message);
  }

  revalidatePath(`/person/${personId}`);
  return { success: true };
}
