import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { createPerson } from "@/lib/actions/people";
import { PersonStepper } from "@/components/person/PersonStepper";

type Props = {
  searchParams: Promise<{ father?: string; mother?: string }>;
};

export default async function NewPersonPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const fatherId = sp.father ?? null;
  const motherId = sp.mother ?? null;

  const [{ data: people }, { data: fatherRow }, { data: motherRow }] = await Promise.all([
    supabase
      .from("people")
      .select("id, given_en, given_ar, family_name_en, family_name_ar")
      .is("deleted_at", null)
      .order("given_en"),
    fatherId
      ? supabase
          .from("people")
          .select("given_en, given_ar")
          .eq("id", fatherId)
          .single()
      : Promise.resolve({ data: null }),
    motherId
      ? supabase
          .from("people")
          .select("given_en, given_ar")
          .eq("id", motherId)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const fatherName = fatherRow
    ? (lang === "ar"
        ? (fatherRow.given_ar ?? fatherRow.given_en)
        : (fatherRow.given_en ?? fatherRow.given_ar)) ?? null
    : null;

  const motherName = motherRow
    ? (lang === "ar"
        ? (motherRow.given_ar ?? motherRow.given_en)
        : (motherRow.given_en ?? motherRow.given_ar)) ?? null
    : null;

  return (
    <main className="min-h-screen bg-[var(--background)] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-8 transition-colors"
        >
          <span aria-hidden>←</span>
          {lang === "ar" ? "العودة" : "Back"}
        </Link>

        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-8 font-[Fraunces,serif]">
          {lang === "ar" ? "إضافة شخص" : "Add person"}
        </h1>

        <PersonStepper
          action={createPerson}
          people={people ?? []}
          lang={lang}
          fatherId={fatherId}
          motherIdProp={motherId}
          fatherName={fatherName}
          motherName={motherName}
        />
      </div>
    </main>
  );
}
