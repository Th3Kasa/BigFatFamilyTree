import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function TranscriptDetailPage({ params }: Props) {
  const { id } = await params;
  redirect(`/transcripts?t=${id}`);
}
