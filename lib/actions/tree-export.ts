"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchCurrentPerson } from "@/lib/members/current-person";
import { fetchBirthOrders, withBirthOrder } from "@/lib/people/birth-order";
import { TREE_COLUMNS } from "@/lib/people/tree-columns";
import { withSignedPhotos } from "@/lib/storage/photos";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";

export type TreeExportData =
  | { ok: true; people: PersonInput[]; relationships: RelationshipInput[] }
  | { ok: false; reason: "not-linked" | "failed" };

/**
 * Everyone on the tree, for the printable PDF. Only for accounts linked to a
 * person on the tree (an unapproved account can't read its linked person, so it
 * lands here too); RLS still decides which rows come back. The button that calls
 * this hides itself for other accounts, but this check is the one that counts.
 */
export async function loadTreeForExport(): Promise<TreeExportData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not-linked" };
  const me = await fetchCurrentPerson(supabase, user.id);
  if (!me) return { ok: false, reason: "not-linked" };

  const [{ data: rows, error: peopleError }, { data: relationships, error: relationshipsError }, birthOrders] = await Promise.all([
    supabase.from("people").select(TREE_COLUMNS).is("deleted_at", null).order("given_en"),
    supabase.from("relationships").select("id, person_a_id, person_b_id, type, status, order_index"),
    fetchBirthOrders(supabase),
  ]);
  if (peopleError || relationshipsError || !rows) {
    console.error("[tree-export] load failed:", peopleError?.message ?? relationshipsError?.message);
    return { ok: false, reason: "failed" };
  }
  return {
    ok: true,
    people: withBirthOrder(await withSignedPhotos(supabase, rows as PersonInput[]), birthOrders),
    relationships: (relationships ?? []) as RelationshipInput[],
  };
}
