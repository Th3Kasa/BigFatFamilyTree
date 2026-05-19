"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { transcriptSchema } from "@/lib/validation/transcripts";
import type { ActionState } from "@/lib/actions/people";

export async function createTranscript(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = {
    audio_url: formData.get("audio_url")?.toString() ?? null,
    raw_text_ar: formData.get("raw_text_ar")?.toString() || null,
    recorded_at: formData.get("recorded_at")?.toString() || null,
    recorded_with: formData.get("recorded_with")?.toString() || null,
  };

  const parsed = transcriptSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      fieldErrors[key] = issue.message;
    }
    return { success: false, fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("transcripts")
    .insert({
      audio_url: parsed.data.audio_url,
      raw_text_ar: parsed.data.raw_text_ar,
      recorded_at: parsed.data.recorded_at,
      recorded_with: parsed.data.recorded_with || null,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/transcripts");
  redirect(`/transcripts/${data.id}`);
}
