import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { signPhotoValues, signRowPhotos } from "./sign";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * A short-lived (1 hour) URL for one stored photo value (a bucket path or a
 * legacy public URL), or null. Prefer withSignedPhotos() when a page shows many.
 */
export async function getPhotoUrl(supabase: Client, value: string | null | undefined): Promise<string | null> {
  const v = (value ?? "").trim();
  if (!v) return null;
  return (await signPhotoValues(supabase, [v])).get(v) ?? null;
}

/**
 * Sign every photo for a page's rows with a single request, keeping the same
 * `photo_url` field, so components receive a ready-to-render URL and need no
 * changes. Do this where the data is loaded (server pages and loaders).
 */
export function withSignedPhotos<T extends { photo_url?: string | null }>(
  supabase: Client,
  rows: ReadonlyArray<T>,
): Promise<T[]> {
  return signRowPhotos(supabase, rows);
}
