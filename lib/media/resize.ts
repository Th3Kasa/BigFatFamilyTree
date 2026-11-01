import "server-only";

// Shrink a photo for display (WebP, upright, never enlarged). Uses sharp when
// it's available on the server; if it isn't, the original bytes are returned
// so photos still show, just larger.

export type Resized = { body: Uint8Array<ArrayBuffer>; type: string };

type Sharp = (input: Uint8Array) => {
  rotate: () => ReturnType<Sharp>;
  resize: (o: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }) => ReturnType<Sharp>;
  webp: (o: { quality: number }) => ReturnType<Sharp>;
  toBuffer: () => Promise<Buffer>;
};

let sharpLoader: Promise<Sharp | null> | null = null;
function loadSharp(): Promise<Sharp | null> {
  sharpLoader ??= import("sharp").then((m) => (m.default ?? m) as unknown as Sharp).catch(() => null);
  return sharpLoader;
}

/** Fit inside `size`×`size`. GIFs are left alone (they may be animated). */
export async function resizeForDisplay(bytes: Uint8Array<ArrayBuffer>, type: string, size: number): Promise<Resized> {
  if (type === "image/gif") return { body: bytes, type };
  const sharp = await loadSharp();
  if (!sharp) return { body: bytes, type };
  try {
    const out = await sharp(bytes).rotate().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { body: new Uint8Array(out.buffer, out.byteOffset, out.byteLength) as Uint8Array<ArrayBuffer>, type: "image/webp" };
  } catch (e) {
    console.error("[photos] resize failed, sending the original:", e instanceof Error ? e.message : e);
    return { body: bytes, type };
  }
}
