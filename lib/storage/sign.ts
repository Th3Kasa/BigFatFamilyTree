import { photoStoragePath } from "./photo-path";

// Links for photos in the private `photos` bucket. Every photo is served by
// /api/photo, which checks the viewer is an approved member (storage RLS,
// photos_approved_read) and shrinks it to the size asked for. The link for a
// photo never changes, so browsers keep it instead of downloading it again on
// every page, and pages no longer ask storage to sign anything: making the
// links is free, however many people a page shows.
//
// The function names (and the unused client argument) are kept from when
// pages signed hourly storage URLs, so callers don't change.

/** Widths /api/photo serves. 384 covers avatars up to ~190px on 2x screens. */
export const PHOTO_SIZES = [128, 384, 1024] as const;
export type PhotoSize = (typeof PHOTO_SIZES)[number];
export const DEFAULT_PHOTO_SIZE: PhotoSize = 384;

/** The site link for one stored photo value, or null (empty or invalid). External URLs are returned as they are. */
export function photoLink(value: string | null | undefined, size: PhotoSize = DEFAULT_PHOTO_SIZE): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const path = photoStoragePath(v);
  if (path) return `/api/photo?p=${encodeURIComponent(path)}&w=${size}`;
  return /^https?:\/\//i.test(v) ? v : null;
}

/** Stored value -> link to render, for every photo in `values`. Empty and invalid values are left out. */
export async function signPhotoValues(
  _client: unknown,
  values: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const raw of values) {
    const v = (raw ?? "").trim();
    if (!v || out.has(v)) continue;
    const link = photoLink(v);
    if (link) out.set(v, link);
  }
  return out;
}

/** Copy of `rows` whose photo_url is ready to render (a site link, or null when there is none). */
export async function signRowPhotos<T extends { photo_url?: string | null }>(_client: unknown, rows: ReadonlyArray<T>): Promise<T[]> {
  return rows.map((r) => {
    const v = (r.photo_url ?? "").trim();
    return v ? { ...r, photo_url: photoLink(v) } : r;
  });
}
