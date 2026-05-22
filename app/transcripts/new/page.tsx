import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createTranscript } from "@/lib/actions/transcripts";
import { TranscriptForm } from "@/components/forms/TranscriptForm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";

export default async function NewTranscriptPage() {
  const supabase = await createClient();

  const { data: people } = await supabase
    .from("people")
    .select("id, given_en, given_ar")
    .is("deleted_at", null)
    .order("given_en");

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-8">
      <Link
        href="/transcripts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Upload Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <TranscriptForm action={createTranscript} people={people ?? []} />
        </CardContent>
      </Card>
    </main>
  );
}
