import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { CanvasController } from "@/components/graph/CanvasController";
import { MobilePeopleSheet } from "@/components/MobilePeopleSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PersonInput } from "@/lib/graph/transform";

export default async function HomePage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: people }, { data: relationships }] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, given_en, given_ar, family_name_en, family_name_ar, father_id, mother_id, gender, is_placeholder, photo_url, pos_x, pos_y"
      )
      .is("deleted_at", null)
      .order("given_en"),
    supabase.from("relationships").select("*"),
  ]);

  const isEmpty = !people || people.length === 0;

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-16">
        <EmptyState
          icon="🌱"
          title={lang === "ar" ? "ابدأ شجرة عائلتك" : "Start your family tree"}
          description={
            lang === "ar"
              ? "لم يُضَف أي شخص بعد. ابدأ بإضافة أول فرد في العائلة."
              : "No family members added yet. Add the first person to get started."
          }
          action={
            <a
              href="/person/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-semibold text-sm transition-colors"
            >
              {lang === "ar" ? "＋ إضافة شخص" : "＋ Add person"}
            </a>
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
      <div className="h-[calc(100vh-57px)] bg-[#fafafa]">
        <CanvasController
          initialNodes={nodes}
          initialEdges={edges}
          people={typedPeople}
          lang={lang}
        />
      </div>

      {/* Mobile: bottom-sheet people list, triggered by FAB */}
      <MobilePeopleSheet people={typedPeople} lang={lang} />
    </>
  );
}
