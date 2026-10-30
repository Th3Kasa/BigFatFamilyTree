// Browser side of photo uploads: make the smaller timeline copy, then send a
// file to /api/media/upload/[id] in chunks (the server forwards them to Drive).

import { DISPLAY_LONG_EDGE, MAX_DISPLAY_BYTES, UPLOAD_CHUNK_BYTES } from "./limits";

export type DisplayCopy = { blob: Blob; width: number; height: number };

/** JPEG copy at most DISPLAY_LONG_EDGE px on the long edge, upright (EXIF orientation applied). */
export async function makeDisplayCopy(file: File): Promise<DisplayCopy> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, DISPLAY_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas");
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
      if (blob && blob.size <= MAX_DISPLAY_BYTES) return { blob, width: bitmap.width, height: bitmap.height };
    }
    throw new Error("Too large");
  } finally {
    bitmap.close();
  }
}

/** Upload one file in order, chunk by chunk. `onBytes` reports bytes sent so far. */
export async function uploadInChunks(uploadId: string, blob: Blob, onBytes: (sent: number) => void): Promise<void> {
  let start = 0;
  let retries = 0;
  while (start < blob.size) {
    const chunk = blob.slice(start, Math.min(start + UPLOAD_CHUNK_BYTES, blob.size));
    let res: Response;
    try {
      res = await fetch(`/api/media/upload/${uploadId}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream", "x-chunk-start": String(start) },
        body: chunk,
      });
    } catch {
      if (++retries > 3) throw new Error("The connection dropped. Please try again.");
      await new Promise((r) => setTimeout(r, 1000 * retries));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as { done?: boolean; received?: number; error?: string };
    if (res.status === 409 && typeof json.received === "number") {
      start = json.received; // the server is ahead or behind: resume from where it is
      continue;
    }
    if (!res.ok) throw new Error(json.error ?? "Upload failed. Please try again.");
    if (json.done) {
      onBytes(blob.size);
      return;
    }
    start = typeof json.received === "number" ? json.received : start + chunk.size;
    retries = 0;
    onBytes(start);
  }
}
