import { z } from "zod";

export const EVENT_TYPES = [
  "birth",
  "death",
  "marriage",
  "divorce",
  "engagement",
  "migration",
  "education",
  "notable_story",
  "custom",
] as const;

export const DATE_PRECISIONS = [
  "exact",
  "year",
  "decade",
  "before",
  "after",
  "around",
] as const;

/** Photos on a memory: at most this many, each the author's own upload. */
export const MAX_MEMORY_PHOTOS = 6;
/** memories/<author's user id>/<file>.<ext>, matching public.valid_memory_photo_paths (migration 31). */
export const MEMORY_PHOTO_RE = /^memories\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp|gif)$/;

const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const eventSchema = z
  .object({
    type: z.enum(EVENT_TYPES),
    custom_label: nullableText(120),
    date_value: nullableText(20),
    date_precision: z.enum(DATE_PRECISIONS),
    location: nullableText(200),
    story_en: nullableText(4000),
    story_ar: nullableText(4000),
    photo_paths: z.array(z.string().regex(MEMORY_PHOTO_RE)).max(MAX_MEMORY_PHOTOS).default([]),
  })
  .refine((d) => d.type !== "custom" || d.custom_label != null, {
    message: "A label is required for custom events",
    path: ["custom_label"],
  });

export type EventInput = z.infer<typeof eventSchema>;
