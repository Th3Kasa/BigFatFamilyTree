"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { autoLayoutPositions, type PersonInput } from "@/lib/graph/transform";

export async function updateNodePosition(id: string, x: number, y: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ pos_x: x, pos_y: y })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function saveViewport(viewport: { x: number; y: number; zoom: number }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not signed in." };
  const { error } = await supabase
    .from("profiles")
    .update({ canvas_viewport: viewport })
    .eq("id", user.id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function autoLayoutAll() {
  const supabase = await createClient();
  const { data: people, error: readErr } = await supabase
    .from("people")
    .select("id, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y")
    .is("deleted_at", null);
  if (readErr || !people) return { success: false, error: readErr?.message ?? "Read failed." };

  const layout = autoLayoutPositions(people as PersonInput[]);
  const updates = [...layout.entries()].map(([id, { x, y }]) =>
    supabase.from("people").update({ pos_x: x, pos_y: y }).eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return { success: false, error: firstErr.error.message };

  revalidatePath("/");
  return { success: true };
}
