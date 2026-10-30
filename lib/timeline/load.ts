import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { VideoProvider } from "@/lib/media/video";
import type { TimelinePost } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

const isProvider = (v: string | null): v is VideoProvider => v === "youtube" || v === "facebook" || v === "instagram";

/**
 * Everything on a person's timeline: posts on their profile plus posts on
 * other profiles they're tagged in, with photos, tags, hearts and comments.
 * Read with the member's own session (RLS). `available` is false when the
 * timeline tables don't exist yet (migration not applied), so the page can
 * still render.
 */
export async function loadTimeline(supabase: Client, personId: string, viewerId: string | null): Promise<{ available: boolean; posts: TimelinePost[] }> {
  const [own, tagged] = await Promise.all([
    supabase.from("posts").select("*").eq("person_id", personId),
    supabase.from("post_tags").select("post_id").eq("person_id", personId),
  ]);
  if (own.error || tagged.error) return { available: false, posts: [] };

  const ownIds = new Set((own.data ?? []).map((p) => p.id));
  const extraIds = (tagged.data ?? []).map((t) => t.post_id).filter((id) => !ownIds.has(id));
  const extra = extraIds.length ? await supabase.from("posts").select("*").in("id", extraIds) : { data: [] };
  const rows = [...(own.data ?? []), ...(extra.data ?? [])];
  if (rows.length === 0) return { available: true, posts: [] };

  const ids = rows.map((p) => p.id);
  const [media, tags, hearts, comments] = await Promise.all([
    supabase.from("post_media").select("id, post_id, position, width, height").in("post_id", ids).order("position"),
    supabase.from("post_tags").select("post_id, person_id").in("post_id", ids),
    supabase.from("post_hearts").select("post_id, user_id").in("post_id", ids),
    supabase.from("post_comments").select("id, post_id, author_id, author_name, body, created_at").in("post_id", ids).order("created_at"),
  ]);

  const group = <T extends { post_id: string }>(list: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const x of list ?? []) m.set(x.post_id, [...(m.get(x.post_id) ?? []), x]);
    return m;
  };
  const mediaBy = group(media.data);
  const tagsBy = group(tags.data);
  const heartsBy = group(hearts.data);
  const commentsBy = group(comments.data);

  const posts: TimelinePost[] = rows.map((p) => ({
    id: p.id,
    personId: p.person_id,
    authorId: p.author_id,
    authorName: p.author_name,
    title: p.title,
    body: p.body,
    dateValue: p.date_value,
    datePrecision: p.date_precision,
    location: p.location,
    video: isProvider(p.video_provider) && p.video_ref && p.video_url ? { provider: p.video_provider, ref: p.video_ref, url: p.video_url } : null,
    createdAt: p.created_at,
    edited: new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 60_000,
    media: (mediaBy.get(p.id) ?? []).map((m) => ({ id: m.id, width: m.width, height: m.height })),
    tagIds: (tagsBy.get(p.id) ?? []).map((t) => t.person_id),
    hearts: (heartsBy.get(p.id) ?? []).length,
    hearted: !!viewerId && (heartsBy.get(p.id) ?? []).some((h) => h.user_id === viewerId),
    comments: (commentsBy.get(p.id) ?? []).map((c) => ({ id: c.id, authorId: c.author_id, authorName: c.author_name, body: c.body, createdAt: c.created_at })),
  }));
  return { available: true, posts };
}
