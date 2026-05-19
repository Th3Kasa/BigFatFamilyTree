import { z } from "zod";

export const transcriptSchema = z.object({
  audio_url: z.string().url(),
  raw_text_ar: z.string().max(50000).nullable(),
  recorded_at: z.string().date().nullable(),
  recorded_with: z.string().uuid().nullable(),
});

export type TranscriptInput = z.infer<typeof transcriptSchema>;
