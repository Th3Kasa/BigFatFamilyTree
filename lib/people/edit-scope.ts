import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { EditableScope } from "@/components/providers/role-provider";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Who the signed-in member may edit, from the database's own rule
// (public.my_editable_person_ids / can_edit_person, migration 31): admins
// everyone; editors their close family and people they added; viewers nobody.
// Used to decide which editing controls to show. RLS enforces the writes.

export async function fetchEditableScope(supabase: Supabase, role: string | null | undefined): Promise<EditableScope> {
  if (role === "admin") return "all";
  if (role !== "editor") return [];
  const { data, error } = await supabase.rpc("my_editable_person_ids");
  if (error) {
    // Before migration 31 the function does not exist: show nothing as editable
    // rather than everything (the database is the real gate either way).
    console.error("[edit-scope] my_editable_person_ids failed:", error.message);
    return [];
  }
  if (data === null) return "all";
  return Array.isArray(data) ? (data as string[]) : [];
}

/** May the signed-in member edit this one person? */
export async function canEditPerson(supabase: Supabase, role: string | null | undefined, personId: string): Promise<boolean> {
  if (role === "admin") return true;
  if (role !== "editor") return false;
  const { data, error } = await supabase.rpc("can_edit_person", { p_target: personId });
  if (error) {
    console.error("[edit-scope] can_edit_person failed:", error.message);
    return false;
  }
  return data === true;
}
