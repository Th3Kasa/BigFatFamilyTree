import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";

type Props = { params: Promise<{ id: string }> };

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: person }, { data: events }] = await Promise.all([
    supabase
      .from("people")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("events")
      .select("*")
      .eq("person_id", id)
      .order("date_value", { ascending: true }),
  ]);

  if (!person) notFound();

  const given =
    lang === "ar" ? (person.given_ar ?? person.given_en) : (person.given_en ?? person.given_ar);
  const fatherName =
    lang === "ar"
      ? (person.father_name_ar ?? person.father_name_en)
      : (person.father_name_en ?? person.father_name_ar);
  const grandfatherName =
    lang === "ar"
      ? (person.grandfather_name_ar ?? person.grandfather_name_en)
      : (person.grandfather_name_en ?? person.grandfather_name_ar);
  const familyName =
    lang === "ar"
      ? (person.family_name_ar ?? person.family_name_en)
      : (person.family_name_en ?? person.family_name_ar);

  const fullNameChain = [given, fatherName, grandfatherName, familyName]
    .filter(Boolean)
    .join(" ");

  const eventTypeLabel: Record<string, { ar: string; en: string }> = {
    birth:         { ar: "الميلاد",    en: "Birth" },
    death:         { ar: "الوفاة",     en: "Death" },
    marriage:      { ar: "الزواج",     en: "Marriage" },
    divorce:       { ar: "الطلاق",     en: "Divorce" },
    engagement:    { ar: "الخطوبة",    en: "Engagement" },
    migration:     { ar: "الهجرة",     en: "Migration" },
    education:     { ar: "التعليم",    en: "Education" },
    notable_story: { ar: "قصة بارزة", en: "Notable Story" },
    custom:        { ar: "حدث",        en: "Event" },
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>

      <div className="flex items-center gap-4 mb-8">
        {person.photo_url ? (
          <img
            src={person.photo_url}
            alt={given ?? ""}
            className="w-20 h-20 rounded-full object-cover border-4 border-amber-100"
          />
        ) : (
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl border-4 ${
              person.gender === "f" ? "bg-rose-50 border-rose-100" : "bg-sky-50 border-sky-100"
            }`}
          >
            {person.gender === "f" ? "👩" : "👨"}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{given ?? "?"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{fullNameChain}</p>
        </div>
      </div>

      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">
          {lang === "ar" ? "الأحداث" : "Timeline"}
        </h2>

        {events && events.length > 0 ? (
          <ol className="relative border-s border-gray-200">
            {events.map((e) => {
              const label =
                lang === "ar"
                  ? (eventTypeLabel[e.type]?.ar ?? e.type)
                  : (eventTypeLabel[e.type]?.en ?? e.type);
              const story = lang === "ar" ? (e.story_ar ?? e.story_en) : (e.story_en ?? e.story_ar);
              return (
                <li key={e.id} className="ms-4 mb-6">
                  <div className="absolute w-2.5 h-2.5 bg-amber-400 rounded-full -start-1.5 top-1.5" />
                  <time className="text-xs text-gray-400">
                    {e.date_value ?? (lang === "ar" ? "تاريخ غير معروف" : "Date unknown")}
                    {(e.date_precision as string) !== "exact" && ` (${e.date_precision})`}
                  </time>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{label}</p>
                  {story && <p className="text-sm text-gray-600 mt-1">{story}</p>}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-gray-400">
            {lang === "ar" ? "لا توجد أحداث مسجّلة." : "No events recorded yet."}
          </p>
        )}
      </section>
    </main>
  );
}
