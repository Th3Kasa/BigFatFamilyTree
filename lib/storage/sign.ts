import { PHOTO_BUCKET, photoStoragePath } from "./photo-path";

// Batch-signing for the private `photos` bucket. Client-agnostic: it works with
// the server client (pages and loaders) and with the browser client (the people
// directory). Callers must be approved members: signing is allowed by the same
// storage RLS policy as reading (photos_approved_read).

export const PHOTO_URL_TTL_SECONDS = 3600;

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => Promise<{ data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null; error: unknown }>;
    };
  };
};

/**
 * Sign every bucket photo in `values` with ONE request. Returns original value
 * -> URL to render. External URLs map to themselves; empty values, unknown
 * paths and failures map to nothing (callers fall back to initials).
 */
export async function signPhotoValues(
  client: StorageClient,
  values: ReadonlyArray<string | null | undefined>,
  expiresIn: number = PHOTO_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byPath = new Map<string, string[]>(); // path -> the stored values that point at it
  for (const raw of values) {
    const v = (raw ?? "").trim();
    if (!v || out.has(v)) continue;
    const path = photoStoragePath(v);
    if (path) byPath.set(path, [...(byPath.get(path) ?? []), v]);
    else if (/^https?:\/\//i.test(v)) out.set(v, v); // external image
  }
  if (byPath.size === 0) return out;

  try {
    const { data } = await client.storage.from(PHOTO_BUCKET).createSignedUrls([...byPath.keys()], expiresIn);
    for (const item of data ?? []) {
      if (!item.path || item.error || !item.signedUrl) continue;
      for (const v of byPath.get(item.path) ?? []) out.set(v, item.signedUrl);
    }
  } catch (e) {
    console.error("[photos] signing failed:", e instanceof Error ? e.message : e);
  }
  return out;
}

/** Copy of `rows` whose photo_url is ready to render (signed, or null when there is none). */
export async function signRowPhotos<T extends { photo_url?: string | null }>(
  client: StorageClient,
  rows: ReadonlyArray<T>,
): Promise<T[]> {
  const signed = await signPhotoValues(
    client,
    rows.map((r) => r.photo_url),
  );
  return rows.map((r) => {
    const v = (r.photo_url ?? "").trim();
    return v ? { ...r, photo_url: signed.get(v) ?? null } : r;
  });
}
