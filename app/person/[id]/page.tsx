import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { deletePerson } from "@/lib/actions/people";
import { createRelationship } from "@/lib/actions/relationships";
import { RelationshipForm } from "@/components/forms/RelationshipForm";

type Props = { params: Promise<{ id: string }> };

export default async function PersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: person }, { data: events }, { data: people }, { data: relationships }] =
    await Promise.all([
      supabase.from("people").select("*").eq("id", id).is("deleted_at", null).single(),
      supabase.from("events").select("*").eq("person_id", id).order("date_value", { ascending: true }),
      supabase
        .from("people")
        .select("id, given_en, given_ar, family_name_en, family_name_ar")
        .is("deleted_at", null)
        .neq("id", id),
      supabase
        .from("relationships")
        .select("*, person_a:people!relationships_person_a_id_fkey(id,given_en,given_ar), person_b:people!relationships_person_b_id_fkey(id,given_en,given_ar)")
        .or(`person_a_id.eq.${id},person_b_id.eq.${id}`),
    ]);

  if (!person) notFound();

  async function handleDelete() {
    "use server";
    await deletePerson(id);
  }

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
  const fullNameChain = [given, fatherName, grandfatherName, familyName].filter(Boolean).join(" ");
  const initials = (given ?? "?").slice(0, 2).toUpperCase();
  const notes = lang === "ar" ? (person.notes_ar ?? person.notes_en) : (person.notes_en ?? person.notes_ar);

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

  const relTypeLabel: Record<string, { ar: string; en: string }> = {
    spouse:     { ar: "زوج/زوجة",       en: "Spouse" },
    adopted_by: { ar: "متبنَّى بواسطة", en: "Adopted by" },
    raised_by:  { ar: "تربى بواسطة",    en: "Raised by" },
    godparent:  { ar: "عرّاب",           en: "Godparent" },
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        {person.photo_url ? (
          <img
            src={person.photo_url}
            alt={given ?? ""}
            className="w-20 h-20 rounded-full object-cover border-4 border-amber-100 shadow-sm"
          />
        ) : (
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-4 shadow-sm ${
              person.gender === "f"
                ? "bg-rose-50 border-rose-100 text-rose-400"
                : "bg-sky-50 border-sky-100 text-sky-400"
            }`}
          >
            {initials}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{given ?? "?"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{fullNameChain}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-8">
        <a
          href={`/person/${person.id}/edit`}
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          {lang === "ar" ? "✏️ تعديل" : "✏️ Edit"}
        </a>
        <form action={handleDelete}>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
            onClick={(e) => {
              if (!confirm(lang === "ar" ? "حذف هذا الشخص؟" : "Delete this person?"))
                e.preventDefault();
            }}
          >
            {lang === "ar" ? "🗑 حذف" : "🗑 Delete"}
          </button>
        </form>
      </div>

      {/* Notes */}
      {notes && (
        <section className="mb-8 p-4 bg-amber-50 rounded-xl border border-amber-100">
          <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            {lang === "ar" ? "ملاحظات" : "Notes"}
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{notes}</p>
        </section>
      )}

      {/* Timeline */}
      <section className="mb-8">
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

      {/* Existing relationships list */}
      {relationships && relationships.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            {lang === "ar" ? "العلاقات" : "Relationships"}
          </h2>
          <ul className="space-y-2">
            {relationships.map((r) => {
              const other = r.person_a_id === id
                ? (r.person_b as { id: string; given_en: string | null; given_ar: string | null } | null)
                : (r.person_a as { id: string; given_en: string | null; given_ar: string | null } | null);
              const otherName = other
                ? ((lang === "ar" ? other.given_ar ?? other.given_en : other.given_en ?? other.given_ar) ?? "?")
                : "?";
              const typeLabel =
                lang === "ar"
                  ? (relTypeLabel[r.type]?.ar ?? r.type)
                  : (relTypeLabel[r.type]?.en ?? r.type);
              return (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <a href={`/person/${other?.id}`} className="font-medium text-gray-800 hover:text-amber-600 transition-colors">
                    {otherName}
                  </a>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{typeLabel}</span>
                  {r.status !== "current" && (
                    <span className="text-xs text-gray-400">({r.status})</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Add relationship */}
      <section className="mt-4">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">
          {lang === "ar" ? "إضافة علاقة" : "Add relationship"}
        </h2>
        <RelationshipForm
          people={people ?? []}
          lang={lang}
          action={createRelationship.bind(null, person.id)}
        />
      </section>
    </main>
  );
}
