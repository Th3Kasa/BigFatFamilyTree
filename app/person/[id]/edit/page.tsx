import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { updatePerson } from "@/lib/actions/people";
import { PersonForm } from "@/components/forms/PersonForm";

type Props = { params: Promise<{ id: string }> };

export default async function EditPersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const [{ data: person }, { data: people }] = await Promise.all([
    supabase.from("people").select("*").eq("id", id).is("deleted_at", null).single(),
    supabase
      .from("people")
      .select("id, given_en, given_ar, family_name_en, family_name_ar")
      .is("deleted_at", null)
      .order("given_en"),
  ]);

  if (!person) notFound();

  const updateThisPerson = updatePerson.bind(null, id);
  const given = lang === "ar" ? (person.given_ar ?? person.given_en) : (person.given_en ?? person.given_ar);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href={`/person/${id}`}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block"
      >
        {lang === "ar" ? "← العودة" : "← Back"}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        {lang === "ar" ? `تعديل: ${given ?? ""}` : `Edit: ${given ?? ""}`}
      </h1>
      <PersonForm
        action={updateThisPerson}
        initialData={person}
        people={people ?? []}
        lang={lang}
        submitLabel={lang === "ar" ? "حفظ التغييرات" : "Save changes"}
      />
    </main>
  );
}
