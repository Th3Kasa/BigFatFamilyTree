"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OFFSET = 100_000;

/**
 * Save a manual sideways nudge for a couple on the tree. The automatic
 * generation layout is the source of truth; this only stores the horizontal
 * offset from it (pos_x = offset, pos_y = null), so cards always stay in their
 * generation row. Editors and admins only (enforced by RLS on people).
 */
export async function saveCardOffset(id: string, offset: number): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(id) || !Number.isFinite(offset) || Math.abs(offset) > MAX_OFFSET) {
    return { success: false, error: "Invalid position." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .update({ pos_x: Math.round(offset), pos_y: null })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { success: false, error: error.message };
  // RLS silently filters rows a viewer may not change: treat "nothing updated" as a failure.
  if (!data || data.length === 0) return { success: false, error: "You don't have permission to move cards." };
  revalidatePath("/");
  return { success: true };
}

/**
 * "Tidy up": clear every manual nudge (and any position saved by the old
 * layout) so the whole tree returns to the automatic generation layout.
 * Admins only, because it resets positions others may have set.
 */
export async function autoLayoutAll(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role?: string | null } | null)?.role !== "admin") {
    return { success: false, error: "Only admins can tidy up the whole tree." };
  }

  const { error } = await supabase
    .from("people")
    .update({ pos_x: null, pos_y: null })
    .or("pos_x.not.is.null,pos_y.not.is.null");
  if (error) return { success: false, error: error.message };

  revalidatePath("/");
  return { success: true };
}
