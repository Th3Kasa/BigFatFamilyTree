import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";

export default async function TranscriptsPage() {
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("id, audio_url, recorded_at, recorded_with, created_at, raw_text_ar")
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 block mb-2">
            {lang === "ar" ? "→ العودة" : "← Back"}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === "ar" ? "التسجيلات الصوتية" : "Audio Transcripts"}
          </h1>
        </div>
        <a
          href="/transcripts/new"
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
        >
          {lang === "ar" ? "＋ رفع تسجيل" : "＋ Upload"}
        </a>
      </div>

      {!transcripts || transcripts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎙️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            {lang === "ar" ? "لا توجد تسجيلات بعد" : "No recordings yet"}
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {lang === "ar"
              ? "ارفع تسجيلاً صوتياً لحفظ قصص العائلة."
              : "Upload an audio recording to preserve family stories."}
          </p>
          <a
            href="/transcripts/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors"
          >
            {lang === "ar" ? "＋ رفع تسجيل" : "＋ Upload recording"}
          </a>
        </div>
      ) : (
        <ul className="space-y-3">
          {transcripts.map((t) => (
            <li key={t.id}>
              <a
                href={`/transcripts/${t.id}`}
                className="block p-4 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎙️</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {t.recorded_at
                        ? new Date(t.recorded_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-AU")
                        : (lang === "ar" ? "تاريخ غير معروف" : "Unknown date")}
                    </p>
                    <p className="text-xs text-gray-400">
                      {lang === "ar" ? "أُضيف " : "Added "}
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                    {t.raw_text_ar && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2" dir="rtl">
                        {t.raw_text_ar.slice(0, 120)}…
                      </p>
                    )}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
