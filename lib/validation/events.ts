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
  })
  .refine((d) => d.type !== "custom" || d.custom_label != null, {
    message: "A label is required for custom events",
    path: ["custom_label"],
  });

export type EventInput = z.infer<typeof eventSchema>;
