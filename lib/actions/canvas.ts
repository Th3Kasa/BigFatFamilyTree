"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { autoLayoutPositions, type PersonInput, type RelationshipInput } from "@/lib/graph/transform";

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

export async function autoLayoutAll() {
  const supabase = await createClient();
  const [{ data: people, error: readErr }, { data: rels }] = await Promise.all([
    supabase
      .from("people")
      .select("id, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y")
      .is("deleted_at", null),
    supabase
      .from("relationships")
      .select("id, person_a_id, person_b_id, type, status, order_index"),
  ]);
  if (readErr || !people) return { success: false, error: readErr?.message ?? "Read failed." };

  const layout = autoLayoutPositions(
    people as PersonInput[],
    (rels ?? []) as RelationshipInput[],
  );
  const updates = [...layout.entries()].map(([id, { x, y }]) =>
    supabase.from("people").update({ pos_x: x, pos_y: y }).eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return { success: false, error: firstErr.error.message };

  revalidatePath("/");
  return { success: true };
}
