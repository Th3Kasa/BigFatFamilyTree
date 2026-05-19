"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, Search, Plus, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Transcript = {
  id: string;
  audio_url: string | null;
  recorded_at: string | null;
  recorded_with: string | null;
  created_at: string;
  raw_text_ar: string | null;
  person_name: string | null;
  proposal_status: string | null;
};

type Props = {
  transcripts: Transcript[];
  lang: string;
  selectedId: string | null;
};

function TranscriptDetail({ transcript, lang }: { transcript: Transcript; lang: string }) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-border">
        <p className="text-xs text-muted-foreground mb-1">
          {transcript.recorded_at
            ? new Date(transcript.recorded_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-AU", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : lang === "ar"
            ? "تاريخ غير معروف"
            : "Unknown date"}
        </p>
        {transcript.person_name && (
          <Link
            href={`/person/${transcript.recorded_with}`}
            className="text-sm text-amber-600 hover:underline"
          >
            {transcript.person_name}
          </Link>
        )}
      </div>

      {/* Audio player placeholder */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Mic className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-amber-400 rounded-full" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "ar" ? "مشغّل الصوت" : "Audio player"}
            </p>
          </div>
          <Link
            href={`/transcripts/${transcript.id}`}
            className="text-xs text-amber-600 hover:underline flex-shrink-0"
          >
            {lang === "ar" ? "فتح" : "Open full"}
          </Link>
        </div>
      </div>

      {/* Transcript text / segments */}
      <div className="flex-1 overflow-y-auto p-6">
        {transcript.raw_text_ar ? (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {lang === "ar" ? "النص" : "Transcript"}
            </h3>
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900">
              <p
                className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                dir="rtl"
              >
                {transcript.raw_text_ar}
              </p>
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lang === "ar" ? "لا يوجد نص بعد." : "No transcript text yet."}
          </p>
        )}

        {/* Extraction proposals placeholder */}
        {transcript.proposal_status && (
          <section className="mt-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {lang === "ar" ? "مقترحات الاستخراج" : "Extraction proposals"}
            </h3>
            <div className="p-4 rounded-xl border border-border bg-card">
              <Badge
                variant={
                  transcript.proposal_status === "pending"
                    ? "secondary"
                    : transcript.proposal_status === "approved"
                    ? "default"
                    : "destructive"
                }
              >
                {transcript.proposal_status}
              </Badge>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export function TranscriptsSplitView({ transcripts, lang, selectedId }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return transcripts;
    return transcripts.filter(
      (t) =>
        t.raw_text_ar?.toLowerCase().includes(q) ||
        t.person_name?.toLowerCase().includes(q) ||
        (t.recorded_at && new Date(t.recorded_at).toLocaleDateString().includes(q))
    );
  }, [transcripts, search]);

  const selectedTranscript = selectedId ? transcripts.find((t) => t.id === selectedId) ?? null : null;

  function selectTranscript(id: string) {
    router.push(`/transcripts?t=${id}`, { scroll: false });
  }

  return (
    <div className="flex flex-col md:grid md:grid-cols-[320px_1fr] h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left column */}
      <div
        className={cn(
          "flex flex-col border-r border-border bg-card",
          selectedTranscript ? "hidden md:flex" : "flex"
        )}
      >
        {/* Left header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold text-foreground">
              {lang === "ar" ? "التسجيلات الصوتية" : "Transcripts"}
            </h1>
            <Link
              href="/transcripts/new"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {lang === "ar" ? "رفع" : "New"}
            </Link>
          </div>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "ar" ? "بحث…" : "Search transcripts…"}
              className="ps-9 h-8 text-sm"
            />
          </div>
        </div>

        {/* Transcript list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Mic className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search
                  ? lang === "ar"
                    ? "لا توجد نتائج"
                    : "No results"
                  : lang === "ar"
                  ? "لا توجد تسجيلات بعد"
                  : "No transcripts yet"}
              </p>
              {!search && (
                <Link
                  href="/transcripts/new"
                  className="mt-4 text-xs text-amber-600 hover:underline"
                >
                  {lang === "ar" ? "رفع تسجيل" : "Upload a recording"}
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => selectTranscript(t.id)}
                    className={cn(
                      "w-full text-start px-4 py-3 transition-colors hover:bg-muted/50 group",
                      selectedId === t.id && "bg-amber-50 dark:bg-amber-950/20 border-s-2 border-amber-500"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Mic className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-sm font-medium text-foreground truncate">
                            {t.recorded_at
                              ? new Date(t.recorded_at).toLocaleDateString(
                                  lang === "ar" ? "ar-EG" : "en-AU"
                                )
                              : lang === "ar"
                              ? "تاريخ غير معروف"
                              : "Unknown date"}
                          </p>
                          {t.proposal_status && (
                            <Badge
                              variant={
                                t.proposal_status === "pending"
                                  ? "secondary"
                                  : t.proposal_status === "approved"
                                  ? "default"
                                  : "destructive"
                              }
                              className="text-[10px] h-4 px-1.5 flex-shrink-0"
                            >
                              {t.proposal_status}
                            </Badge>
                          )}
                        </div>
                        {t.person_name && (
                          <p className="text-xs text-amber-600 mb-1">{t.person_name}</p>
                        )}
                        {t.raw_text_ar && (
                          <p
                            className="text-xs text-muted-foreground line-clamp-2 leading-relaxed"
                            dir="rtl"
                          >
                            {t.raw_text_ar.slice(0, 120)}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-1 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className={cn("flex-1 overflow-hidden bg-background", selectedTranscript ? "flex flex-col" : "hidden md:flex md:flex-col")}>
        {selectedTranscript ? (
          <>
            {/* Mobile back button */}
            <div className="md:hidden p-3 border-b border-border">
              <button
                onClick={() => router.push("/transcripts", { scroll: false })}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
                {lang === "ar" ? "العودة" : "Back"}
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <TranscriptDetail transcript={selectedTranscript} lang={lang} />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Mic className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {lang === "ar" ? "اختر تسجيلاً لعرض التفاصيل" : "Select a transcript to view details"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
