import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { createPerson } from "@/lib/actions/people";
import { PersonStepper } from "@/components/person/PersonStepper";

type Props = {
  searchParams: Promise<{ father?: string; mother?: string; spouse?: string }>;
};

export default async function NewPersonPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const fatherId = sp.father ?? null;
  const motherId = sp.mother ?? null;
  const spouseId = sp.spouse ?? null;

  const [{ data: people }, { data: fatherRow }, { data: motherRow }, { data: spouseRow }] =
    await Promise.all([
      supabase
        .from("people")
        .select("id, given_en, given_ar, family_name_en, family_name_ar")
        .is("deleted_at", null)
        .order("given_en"),
      fatherId
        ? supabase.from("people").select("given_en, given_ar").eq("id", fatherId).single()
        : Promise.resolve({ data: null }),
      motherId
        ? supabase.from("people").select("given_en, given_ar").eq("id", motherId).single()
        : Promise.resolve({ data: null }),
      spouseId
        ? supabase.from("people").select("given_en, given_ar").eq("id", spouseId).single()
        : Promise.resolve({ data: null }),
    ]);

  function pickName(row: { given_en?: string | null; given_ar?: string | null } | null) {
    if (!row) return null;
    return (lang === "ar" ? (row.given_ar ?? row.given_en) : (row.given_en ?? row.given_ar)) ?? null;
  }

  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const spouseName = pickName(spouseRow) ?? "";
  const pageTitle = spouseId
    ? t(`Add ${spouseName}'s spouse`, `إضافة زوج/زوجة ${spouseName}`)
    : t("Add a person", "إضافة شخص");

  return (
    <div className="flex flex-col items-center px-3 py-6 sm:px-5 sm:py-8">
      <div className="w-full max-w-lg">
        <Link
          href="/"
          className="mb-4 inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <span aria-hidden className="rtl:rotate-180">←</span>
          {t("Back to the tree", "العودة إلى الشجرة")}
        </Link>

        <h1 className="font-heading mb-6 text-2xl font-bold text-[var(--foreground)] sm:text-[28px]">
          {pageTitle}
        </h1>

        <PersonStepper
          action={createPerson}
          people={people ?? []}
          lang={lang}
          fatherId={fatherId}
          motherIdProp={motherId}
          fatherName={pickName(fatherRow)}
          motherName={pickName(motherRow)}
          spouseId={spouseId}
        />
      </div>
    </div>
  );
}
