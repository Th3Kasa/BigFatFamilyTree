import { z } from "zod";

const nullableText = z.string().max(200).nullish().transform((v) => v ?? null);

export const personSchema = z
  .object({
    given_en: nullableText,
    given_ar: nullableText,
    father_name_en: nullableText,
    father_name_ar: nullableText,
    grandfather_name_en: nullableText,
    grandfather_name_ar: nullableText,
    great_grandfather_name_en: nullableText,
    great_grandfather_name_ar: nullableText,
    family_name_en: nullableText,
    family_name_ar: nullableText,
    gender: z.enum(["m", "f", "unknown"]),
    father_id: z.string().uuid().nullish().transform((v) => v ?? null),
    mother_id: z.string().uuid().nullish().transform((v) => v ?? null),
    is_placeholder: z.boolean(),
    photo_url: z.string().url().nullish().transform((v) => v ?? null),
    notes_en: z.string().max(2000).nullish().transform((v) => v ?? null),
    notes_ar: z.string().max(2000).nullish().transform((v) => v ?? null),
    birth_date: z.string().max(20).nullish().transform((v) => v ?? null),
    death_date: z.string().max(20).nullish().transform((v) => v ?? null),
  })
  .refine(
    (d) => d.given_en != null || d.given_ar != null || d.is_placeholder,
    {
      message: "At least one name (English or Arabic) is required",
      path: ["given_en"],
    },
  );

export type PersonInput = z.infer<typeof personSchema>;
