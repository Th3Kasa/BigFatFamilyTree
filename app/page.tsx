import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { buildGraphElements } from "@/lib/graph/transform";
import { FamilyGraph } from "@/components/graph/FamilyGraph";
import { PeopleList } from "@/components/PeopleList";

export default async function Home() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: people, error: peopleErr }, { data: relationships, error: relErr }] =
    await Promise.all([
      supabase
        .from("people")
        .select(
          "id, given_ar, given_en, family_name_ar, family_name_en, father_id, mother_id, gender, is_placeholder, photo_url",
        )
        .is("deleted_at", null),
      supabase
        .from("relationships")
        .select("id, person_a_id, person_b_id, type, status, order_index"),
    ]);

  if (peopleErr) throw peopleErr;
  if (relErr) throw relErr;

  const { nodes, edges } = buildGraphElements(people ?? [], relationships ?? [], lang);

  return (
    <>
      {/* Desktop: full-screen graph */}
      <div className="hidden md:block">
        <FamilyGraph nodes={nodes} edges={edges} />
      </div>
      {/* Mobile: grouped list */}
      <div className="md:hidden">
        <PeopleList people={people ?? []} lang={lang} />
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
