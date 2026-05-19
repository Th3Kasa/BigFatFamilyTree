import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { createTranscript } from "@/lib/actions/transcripts";
import { TranscriptForm } from "@/components/forms/TranscriptForm";

export default async function NewTranscriptPage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: people } = await supabase
    .from("people")
    .select("id, given_en, given_ar")
    .is("deleted_at", null)
    .order("given_en");

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/transcripts" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        {lang === "ar" ? "رفع تسجيل صوتي" : "Upload recording"}
      </h1>
      <TranscriptForm action={createTranscript} people={people ?? []} lang={lang} />
    </main>
  );
}
