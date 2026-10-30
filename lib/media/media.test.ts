import { describe, expect, it } from "vitest";
import { embedUrl, parseVideoLink, posterUrl } from "./video";
import { isPhotoType, sniffMatches, UPLOAD_CHUNK_BYTES } from "./limits";

describe("parseVideoLink", () => {
  it("reads every common YouTube form and builds a no-cookie player", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ]) {
      expect(parseVideoLink(url)).toEqual({ provider: "youtube", ref: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    }
    expect(embedUrl("youtube", "dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
    expect(posterUrl("youtube", "dQw4w9WgXcQ")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  it("reads Instagram posts and reels", () => {
    expect(parseVideoLink("https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz")).toMatchObject({ provider: "instagram", ref: "reel/C1a2B3c4D5e" });
    expect(parseVideoLink("instagram.com/p/C1a2B3c4D5e")).toMatchObject({ ref: "p/C1a2B3c4D5e", url: "https://www.instagram.com/p/C1a2B3c4D5e/" });
    expect(embedUrl("instagram", "reel/C1a2B3c4D5e")).toBe("https://www.instagram.com/reel/C1a2B3c4D5e/embed/");
  });

  it("reads Facebook video links, drops tracking, and builds the plugin player", () => {
    const v = parseVideoLink("https://www.facebook.com/someone/videos/1234567890123/?mibextid=abc&fbclid=zzz");
    expect(v).toEqual({ provider: "facebook", ref: "https://www.facebook.com/someone/videos/1234567890123", url: "https://www.facebook.com/someone/videos/1234567890123" });
    expect(parseVideoLink("https://www.facebook.com/watch/?v=1234567890123")?.url).toBe("https://www.facebook.com/watch?v=1234567890123");
    expect(parseVideoLink("https://fb.watch/abcDEF123/")?.provider).toBe("facebook");
    expect(parseVideoLink("https://www.facebook.com/share/v/1AbCdEf/")?.provider).toBe("facebook");
    expect(embedUrl("facebook", v!.ref)).toBe(
      "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fsomeone%2Fvideos%2F1234567890123&show_text=false&autoplay=true",
    );
  });

  it("refuses anything else, including look-alike hosts and non-video Facebook pages", () => {
    for (const bad of [
      "",
      "not a url",
      "javascript:alert(1)",
      "https://evil.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=short",
      "https://www.facebook.com/someone",
      "https://www.facebook.com/share/p/1AbCdEf/",
      "https://www.instagram.com/someone/",
      "https://vimeo.com/123456",
    ]) {
      expect(parseVideoLink(bad), bad).toBeNull();
    }
    expect(embedUrl("youtube", "<script>")).toBeNull();
    expect(embedUrl("facebook", "https://evil.com/videos/1")).toBeNull();
  });
});

describe("photo checks", () => {
  it("accepts only JPEG, PNG, WebP and GIF", () => {
    expect(isPhotoType("image/jpeg")).toBe(true);
    expect(isPhotoType("image/svg+xml")).toBe(false);
    expect(isPhotoType("image/heic")).toBe(false);
  });

  it("checks the file really starts like the type it claims", () => {
    const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(sniffMatches("image/gif", bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe(true);
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffMatches("image/webp", webp)).toBe(true);
    // An HTML page renamed to .jpg is refused.
    expect(sniffMatches("image/jpeg", new TextEncoder().encode("<html><script>"))).toBe(false);
    expect(sniffMatches("image/png", bytes(0xff, 0xd8, 0xff))).toBe(false);
  });

  it("uses chunks Google Drive accepts and the host can carry", () => {
    expect(UPLOAD_CHUNK_BYTES % (256 * 1024)).toBe(0);
    expect(UPLOAD_CHUNK_BYTES).toBeLessThan(4.5 * 1000 * 1000);
  });
});
