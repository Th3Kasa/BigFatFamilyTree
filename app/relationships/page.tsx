import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { RelationshipFinder } from "@/components/relationships/RelationshipFinder";
import { withSignedPhotos } from "@/lib/storage/photos";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";

const TREE_COLUMNS =
  "id, slug, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y";

type SearchParams = Promise<{ a?: string | string[]; b?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: lang === "ar" ? "ما صلة القرابة بيننا؟ · شجرة العائلة" : "How are we related? · Big Fat Family Tree",
  };
}

/** A single query value, or null (arrays and empty strings are ignored). */
function single(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function RelationshipsPage({ searchParams }: { searchParams: SearchParams }) {
  const [supabase, lang, params] = await Promise.all([createClient(), getLang(), searchParams]);

  const [{ data: peopleRows }, { data: relRows }] = await Promise.all([
    supabase.from("people").select(TREE_COLUMNS).is("deleted_at", null).order("given_en"),
    supabase.from("relationships").select("id, person_a_id, person_b_id, type, status, order_index"),
  ]);

  const people = await withSignedPhotos(supabase, (peopleRows ?? []) as PersonInput[]);
  const relationships = (relRows ?? []) as RelationshipInput[];
  const { nodes, edges } = buildGraphElements(people, relationships, lang);

  // Ids from the URL that don't match a real (named) person are ignored.
  const known = new Set(people.filter((p) => !p.is_placeholder).map((p) => p.id));
  const pick = (v: string | string[] | undefined) => {
    const id = single(v);
    return id && known.has(id) ? id : null;
  };

  return (
    <RelationshipFinder
      people={people}
      relationships={relationships}
      nodes={nodes}
      edges={edges}
      lang={lang}
      initialA={pick(params.a)}
      initialB={pick(params.b)}
    />
  );
}
