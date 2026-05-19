import { describe, it, expect } from "vitest";
import { transcriptSchema } from "@/lib/validation/transcripts";

describe("transcriptSchema", () => {
  const valid = {
    audio_url: "https://example.com/audio/test.mp3",
    raw_text_ar: "نص الصوت",
    recorded_at: "2024-03-15",
    recorded_with: null,
  };

  it("accepts a valid transcript", () => {
    expect(transcriptSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts null raw_text_ar", () => {
    expect(transcriptSchema.safeParse({ ...valid, raw_text_ar: null }).success).toBe(true);
  });

  it("accepts null recorded_at", () => {
    expect(transcriptSchema.safeParse({ ...valid, recorded_at: null }).success).toBe(true);
  });

  it("rejects invalid audio_url", () => {
    expect(transcriptSchema.safeParse({ ...valid, audio_url: "not-a-url" }).success).toBe(false);
  });

  it("accepts valid UUID for recorded_with", () => {
    expect(
      transcriptSchema.safeParse({ ...valid, recorded_with: "123e4567-e89b-12d3-a456-426614174000" }).success
    ).toBe(true);
  });

  it("rejects non-UUID recorded_with", () => {
    expect(transcriptSchema.safeParse({ ...valid, recorded_with: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects missing audio_url", () => {
    const { audio_url: _, ...rest } = valid;
    expect(transcriptSchema.safeParse(rest).success).toBe(false);
  });
});
