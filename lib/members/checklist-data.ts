import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isApproved } from "./approval";
import { buildChecklist, type ChecklistData } from "./checklist";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The profile-completion checklist for a signed-in, approved member, or null
 * when there is nothing to show (not approved, not linked to a person yet, or
 * they dismissed it). Never throws.
 */
export async function loadProfileChecklist(supabase: Client, userId: string): Promise<ChecklistData | null> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, approved_at, person_id, checklist_dismissed_at")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || !isApproved(profile) || !profile.person_id || profile.checklist_dismissed_at) return null;

    const [{ data: person }, memories, suggestions] = await Promise.all([
      supabase
        .from("people")
        .select("id, slug, photo_url, birth_date, father_id, mother_id")
        .eq("id", profile.person_id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase.from("events").select("id", { count: "exact", head: true }).eq("contributed_by", userId),
      supabase.from("relative_suggestions").select("id", { count: "exact", head: true }).eq("suggested_by", userId),
    ]);
    if (!person) return null;

    return buildChecklist({
      personRef: person.slug ?? person.id,
      canEdit: profile.role === "admin" || profile.role === "editor",
      hasPhoto: !!person.photo_url,
      hasBirthDate: !!person.birth_date?.trim(),
      hasParents: !!(person.father_id || person.mother_id),
      hasMemory: (memories.count ?? 0) > 0,
      invitedRelative: (suggestions.count ?? 0) > 0,
    });
  } catch (e) {
    console.error("[checklist] failed:", e);
    return null;
  }
}
