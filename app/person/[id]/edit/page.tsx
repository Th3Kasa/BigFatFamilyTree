import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { updatePerson } from "@/lib/actions/people";
import { PersonForm } from "@/components/forms/PersonForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/person/BackButton";

type Props = { params: Promise<{ id: string }> };

export default async function EditPersonPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const personQuery = UUID_RE.test(id)
    ? supabase.from("people").select("*").eq("id", id).is("deleted_at", null).single()
    : supabase.from("people").select("*").eq("slug", id).is("deleted_at", null).single();

  const [{ data: person }, { data: people }] = await Promise.all([
    personQuery,
    supabase
      .from("people")
      .select("id, given_en, given_ar, family_name_en, family_name_ar")
      .is("deleted_at", null)
      .order("given_en"),
  ]);

  if (!person) notFound();

  const updateThisPerson = updatePerson.bind(null, person.id);
  const given =
    lang === "ar"
      ? (person.given_ar ?? person.given_en)
      : (person.given_en ?? person.given_ar);

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <BackButton
            label={lang === "ar" ? "← العودة إلى الملف" : "← Back to profile"}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold font-[Fraunces,serif]">
              {lang === "ar" ? `تعديل: ${given ?? ""}` : `Edit: ${given ?? ""}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PersonForm
              action={updateThisPerson}
              initialData={person}
              people={people ?? []}
              lang={lang}
              submitLabel={lang === "ar" ? "حفظ التغييرات" : "Save changes"}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
