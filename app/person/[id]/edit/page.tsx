import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { getDisplayName } from "@/lib/utils";
import { updatePerson } from "@/lib/actions/people";
import { PersonForm } from "@/components/forms/PersonForm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BackButton } from "@/components/person/BackButton";
import { withSignedPhotos } from "@/lib/storage/photos";

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
  const personWithPhoto = (await withSignedPhotos(supabase, [person]))[0];

  const updateThisPerson = updatePerson.bind(null, person.id);
  const name = getDisplayName(person, lang);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <div className="px-3 py-6 sm:px-5 sm:py-8">
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-4">
          <BackButton label={t("Back to profile", "العودة إلى الملف")} />
        </div>

        <Card>
          <CardHeader>
            <h1 className="font-heading text-2xl font-bold leading-tight text-[var(--foreground)]">
              {t(`Edit ${name}`, `تعديل بيانات ${name}`)}
            </h1>
          </CardHeader>
          <CardContent>
            <PersonForm
              action={updateThisPerson}
              initialData={personWithPhoto}
              people={people ?? []}
              lang={lang}
              submitLabel={t("Save changes", "حفظ التغييرات")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
