import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { FamilyGraph } from "@/components/graph/FamilyGraph";
import { PeopleList } from "@/components/PeopleList";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function HomePage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: people }, { data: relationships }] = await Promise.all([
    supabase
      .from("people")
      .select("*")
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors"
            >
              {lang === "ar" ? "＋ إضافة شخص" : "＋ Add person"}
            </a>
          }
        />
      </div>
    );
  }

  const { nodes, edges } = buildGraphElements(people, relationships ?? [], lang);

  return (
    <>
      {/* Desktop: graph */}
      <div className="hidden md:block h-[calc(100vh-57px)] bg-gray-50">
        <FamilyGraph nodes={nodes} edges={edges} />
      </div>

      {/* Mobile: list */}
      <div className="md:hidden px-4 py-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          {lang === "ar" ? "أفراد العائلة" : "Family members"}
        </h2>
        <PeopleList people={people} lang={lang} />
      </div>

      {/* FAB */}
      <a
        href="/person/new"
        className="fixed bottom-6 end-6 z-50 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 shadow-lg flex items-center justify-center text-white text-2xl transition-colors"
        aria-label={lang === "ar" ? "إضافة شخص" : "Add person"}
      >
        ＋
      </a>
    </>
  );
}
