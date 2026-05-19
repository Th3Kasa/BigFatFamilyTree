import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";

type Props = { params: Promise<{ id: string }> };

export default async function TranscriptDetailPage({ params }: Props) {
  const { id } = await params;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("*")
    .eq("id", id)
    .single();

  if (!transcript) notFound();

  const { data: signedData } = await supabase.storage
    .from("audio")
    .createSignedUrl(transcript.audio_url, 3600);

  let personName: string | null = null;
  if (transcript.recorded_with) {
    const { data: person } = await supabase
      .from("people")
      .select("given_en, given_ar")
      .eq("id", transcript.recorded_with)
      .single();
    if (person) {
      personName = lang === "ar"
        ? (person.given_ar ?? person.given_en)
        : (person.given_en ?? person.given_ar);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/transcripts" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        {lang === "ar" ? "→ العودة" : "← Back"}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {lang === "ar" ? "تسجيل صوتي" : "Recording"}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {transcript.recorded_at
          ? new Date(transcript.recorded_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-AU")
          : (lang === "ar" ? "تاريخ غير معروف" : "Unknown date")}
        {personName && (
          <>
            {" · "}
            <a href={`/person/${transcript.recorded_with}`} className="text-amber-600 hover:underline">
              {personName}
            </a>
          </>
        )}
      </p>

      {signedData?.signedUrl && (
        <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <audio controls className="w-full" src={signedData.signedUrl}>
            {lang === "ar" ? "متصفحك لا يدعم مشغّل الصوت." : "Your browser does not support audio."}
          </audio>
        </div>
      )}

      {transcript.raw_text_ar ? (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            {lang === "ar" ? "النص" : "Transcript"}
          </h2>
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap" dir="rtl">
              {transcript.raw_text_ar}
            </p>
          </div>
        </section>
      ) : (
        <p className="text-sm text-gray-400">
          {lang === "ar" ? "لا يوجد نص بعد." : "No transcript text yet."}
        </p>
      )}
    </main>
  );
}
