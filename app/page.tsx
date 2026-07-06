import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { CanvasView } from "@/components/graph/CanvasView";
import { Landing } from "@/components/Landing";
import { MobilePeopleSheet } from "@/components/MobilePeopleSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";

export default async function HomePage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: { user } } = await supabase.auth.getUser();
  // Signed-out visitors get the public landing page — sign-in happens from
  // inside the site, not as a wall in front of it. Family data stays private.
  if (!user) return <Landing lang={lang} />;

  const [{ data: people }, { data: relationships }] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, slug, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y"
      )
      .is("deleted_at", null)
      .order("given_en"),
    supabase.from("relationships").select("id, person_a_id, person_b_id, type, status, order_index"),
  ]);

  const isEmpty = !people || people.length === 0;

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto w-full px-4 pt-16 pb-24 md:pb-8">
        <EmptyState
          icon="🌱"
          title="Start your family tree"
          description="No family members added yet. Add the first person to get started."
          action={
            <Link
              href="/person/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-semibold text-sm transition-colors"
            >
              ＋ Add person
            </Link>
          }
        />
      </div>
    );
  }

  const typedPeople = people as PersonInput[];
  const { nodes, edges } = buildGraphElements(typedPeople, relationships ?? [], lang);

  return (
    <>
      {/* Canvas — always primary, full viewport */}
      <div
        className="canvas-stage relative h-[calc(100vh-57px-64px)] md:h-[calc(100vh-57px)] overflow-hidden"
        data-grain="on"
      >
        <CanvasView
          initialNodes={nodes}
          initialEdges={edges}
          people={typedPeople}
          relationships={(relationships ?? []) as RelationshipInput[]}
          lang={lang}
        />
      </div>

      {/* Mobile: bottom-sheet people list, triggered by FAB */}
      <MobilePeopleSheet people={typedPeople} lang={lang} />
    </>
  );
}
