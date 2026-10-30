import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { trashFile } from "./client";

export type BinResult = {
  /** Photos moved to the Drive bin this run. */
  binned: number;
  /** Photos of deleted posts still in the folder (Drive unreachable, or more than this run's limit). */
  remaining: number;
  /** False when the tracking column doesn't exist yet (migration 34 not applied). */
  available: boolean;
};

type Row = { id: string; drive_original_id: string; drive_display_id: string };

/**
 * Photos of deleted posts that are still in the family folder. Server-only:
 * deleted posts are hidden from members by RLS, so this reads with the
 * service role.
 */
async function pending(limit: number): Promise<{ rows: Row[]; count: number } | null> {
  const db = createServiceClient();
  const { data, error, count } = await db
    .from("post_media")
    .select("id, drive_original_id, drive_display_id, posts!inner(deleted_at)", { count: "exact" })
    .not("posts.deleted_at", "is", null)
    .is("drive_trashed_at", null)
    .limit(limit);
  if (error) return null;
  return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
}

/** How many photos of deleted posts are still in the folder (null if not trackable yet). */
export async function countDeletedPostPhotos(): Promise<number | null> {
  const p = await pending(1);
  return p ? p.count : null;
}

/**
 * Move the photos of deleted posts (original and timeline copy) to the Drive
 * bin and record it. Safe to run any time and as often as needed: each photo
 * is binned once, and anything Drive couldn't take is retried next run.
 */
export async function binDeletedPostPhotos(limit = 50): Promise<BinResult> {
  const p = await pending(limit);
  if (!p) return { binned: 0, remaining: 0, available: false };
  const db = createServiceClient();
  let binned = 0;
  for (const row of p.rows) {
    const [a, b] = await Promise.all([trashFile(row.drive_original_id), trashFile(row.drive_display_id)]);
    if (!a || !b) continue;
    const { error } = await db.from("post_media").update({ drive_trashed_at: new Date().toISOString() }).eq("id", row.id);
    if (!error) binned++;
  }
  return { binned, remaining: Math.max(0, p.count - binned), available: true };
}
