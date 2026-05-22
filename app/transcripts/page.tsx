import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/lang/server";
import { TranscriptsSplitView } from "@/components/transcripts/TranscriptsSplitView";

type Props = { searchParams: Promise<{ t?: string }> };

export default async function TranscriptsPage({ searchParams }: Props) {
  const { t: selectedId } = await searchParams;
  const [supabase, lang] = await Promise.all([createClient(), getLang()]);

  const { data: transcripts } = await supabase
    .from("transcripts")
    .select("id, audio_url, recorded_at, recorded_with, created_at, raw_text_ar")
    .order("created_at", { ascending: false });

  // Fetch person names for transcripts that have recorded_with
  const personIds = [...new Set((transcripts ?? []).map((t) => t.recorded_with).filter(Boolean))] as string[];
  const { data: people } = personIds.length
    ? await supabase
        .from("people")
        .select("id, given_en, given_ar")
        .in("id", personIds)
    : { data: [] };

  const peopleMap = new Map((people ?? []).map((p) => [p.id, p]));

  // Fetch latest proposal status per transcript
  const transcriptIds = (transcripts ?? []).map((t) => t.id);
  const { data: proposals } = transcriptIds.length
    ? await supabase
        .from("extraction_proposals")
        .select("transcript_id, status")
        .in("transcript_id", transcriptIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Build a map of transcript_id -> latest proposal status (first result per transcript due to ordering)
  const proposalStatusMap = new Map<string, string>();
  for (const p of proposals ?? []) {
    if (!proposalStatusMap.has(p.transcript_id)) {
      proposalStatusMap.set(p.transcript_id, p.status);
    }
  }

  const enriched = (transcripts ?? []).map((t) => {
    const person = t.recorded_with ? peopleMap.get(t.recorded_with) : null;
    const personName = person
      ? lang === "ar"
        ? (person.given_ar ?? person.given_en)
        : (person.given_en ?? person.given_ar)
      : null;
    return {
      ...t,
      person_name: personName ?? null,
      proposal_status: proposalStatusMap.get(t.id) ?? null,
    };
  });

  return (
    <main className="h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)] overflow-hidden">
      <TranscriptsSplitView
        transcripts={enriched}
        lang={lang}
        selectedId={selectedId ?? null}
      />
    </main>
  );
}
