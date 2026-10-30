// Upload limits for timeline photos, shared by the browser and the server.
// The database repeats them as CHECK constraints (post_media, media_uploads).

/** Photos in one post. */
export const MAX_PHOTOS_PER_POST = 5;
/** Full-quality original, as taken. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** The smaller copy shown on the timeline (made in the browser). */
export const MAX_DISPLAY_BYTES = 2 * 1024 * 1024;
/** Long edge of the timeline copy, in pixels. */
export const DISPLAY_LONG_EDGE = 1600;
/**
 * Upload chunk size: under the host's 4.5 MB request limit and a multiple of
 * 256 KiB, as Google Drive's resumable uploads require for all but the last chunk.
 */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export const isPhotoType = (t: string): t is PhotoType => (PHOTO_TYPES as readonly string[]).includes(t);

/** "15 MB" */
export const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Does the start of a file really look like the image type it claims? Checked
 * on the first uploaded chunk so a renamed file can't slip through.
 */
export function sniffMatches(mime: PhotoType, head: Uint8Array): boolean {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  switch (mime) {
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/gif":
      return at(0, 0x47, 0x49, 0x46, 0x38);
    case "image/webp":
      return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
  }
}
