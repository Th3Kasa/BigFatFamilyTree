import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { createPerson } from "@/lib/actions/people";
import { PersonForm } from "@/components/forms/PersonForm";

export default async function NewPersonPage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: people } = await supabase
    .from("people")
    .select("id, given_en, given_ar, family_name_en, family_name_ar")
    .is("deleted_at", null)
    .order("given_en");

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        {lang === "ar" ? "إضافة شخص" : "Add person"}
      </h1>
      <PersonForm
        action={createPerson}
        people={people ?? []}
        lang={lang}
        submitLabel={lang === "ar" ? "حفظ" : "Save"}
      />
    </main>
  );
}
