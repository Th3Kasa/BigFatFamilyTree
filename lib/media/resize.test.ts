import "server-only";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));
const { resizeForDisplay } = await import("./resize");

describe("resizeForDisplay", () => {
  it("shrinks a big photo to fit the size, as WebP, keeping its shape", async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#c0392b" } }).jpeg().toBuffer();
    const out = await resizeForDisplay(new Uint8Array(big) as Uint8Array<ArrayBuffer>, "image/jpeg", 384);
    expect(out.type).toBe("image/webp");
    const meta = await sharp(Buffer.from(out.body)).metadata();
    expect([meta.width, meta.height]).toEqual([384, 256]);
    expect(out.body.byteLength).toBeLessThan(big.byteLength);
  });

  it("never enlarges a small photo, and leaves GIFs (maybe animated) alone", async () => {
    const small = await sharp({ create: { width: 100, height: 80, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const meta = await sharp(Buffer.from((await resizeForDisplay(new Uint8Array(small) as Uint8Array<ArrayBuffer>, "image/png", 384)).body)).metadata();
    expect([meta.width, meta.height]).toEqual([100, 80]);
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38]) as Uint8Array<ArrayBuffer>;
    expect(await resizeForDisplay(gif, "image/gif", 384)).toEqual({ body: gif, type: "image/gif" });
  });

  it("sends the original if the bytes can't be read as an image", async () => {
    const junk = new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resizeForDisplay(junk, "image/jpeg", 384)).toEqual({ body: junk, type: "image/jpeg" });
    spy.mockRestore();
  });
});
