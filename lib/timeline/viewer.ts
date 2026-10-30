import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { isApproved } from "@/lib/members/approval";

type Client = Awaited<ReturnType<typeof createClient>>;

export type Viewer = {
  userId: string;
  approved: boolean;
  isAdmin: boolean;
  /** The person on the tree this member's account is linked to, if any. */
  personId: string | null;
  /** Shown as the author of their posts and comments. */
  name: string;
};

/** The signed-in member, with what the timeline needs to know about them. Null when signed out. */
export async function getViewer(supabase: Client): Promise<Viewer | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("role, approved_at, is_super_admin, person_id, display_name, full_name, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!p) return null;

  let name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.display_name?.trim() || p.full_name?.trim() || "";
  if (!name && p.person_id) {
    const { data: person } = await supabase.from("people").select("given_en, family_name_en, given_ar, family_name_ar").eq("id", p.person_id).maybeSingle();
    if (person) name = [person.given_en ?? person.given_ar, person.family_name_en ?? person.family_name_ar].filter(Boolean).join(" ");
  }
  return {
    userId: user.id,
    approved: isApproved(p),
    isAdmin: p.role === "admin" || !!p.is_super_admin,
    personId: p.person_id,
    name: (name || "A family member").slice(0, 120),
  };
}
