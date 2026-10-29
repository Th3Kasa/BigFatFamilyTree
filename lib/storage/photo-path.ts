// What people.photo_url can hold, and how to read it. Pure, no I/O.
//
//   "9f1c….jpg" or "<personId>/9f1c….jpg"   a path inside the private `photos` bucket (new)
//   "https://<proj>.supabase.co/storage/v1/object/public/photos/<path>"   a legacy public URL
//   "…/object/sign/photos/<path>?token=…"   a signed URL that leaked back from a form
//   "https://elsewhere.example/a.jpg"       an external image, left alone
//
// New uploads store the bare path. Anything that points into our bucket is
// normalised back to its path before it is saved, so signed URLs (which expire)
// never end up in the database.

export const PHOTO_BUCKET = "photos";

const PATH_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}$/;
const BUCKET_URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/photos\/(.+)$/;

function isHttpUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

function isSafePath(v: string): boolean {
  return PATH_RE.test(v) && !v.includes("..") && !v.includes("//");
}

/** The path inside the photos bucket this value refers to, or null (empty, external or invalid). */
export function photoStoragePath(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (isHttpUrl(v)) {
    let pathname: string;
    try {
      pathname = new URL(v).pathname;
    } catch {
      return null;
    }
    const m = BUCKET_URL_RE.exec(pathname);
    if (!m) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
    return isSafePath(decoded) ? decoded : null;
  }
  return isSafePath(v) ? v : null;
}

/** An image hosted somewhere else: shown as is, never signed. */
export function isExternalPhotoUrl(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return isHttpUrl(v) && photoStoragePath(v) === null;
}

/**
 * The value to STORE: the bucket path for anything in our bucket, an external
 * URL unchanged, otherwise null (empty or junk).
 */
export function normalizePhotoValue(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const path = photoStoragePath(v);
  if (path) return path;
  return isExternalPhotoUrl(v) ? v : null;
}
