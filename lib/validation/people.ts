import { z } from "zod";

const nullableText = z.string().max(200).nullable();
const nullableUuid = z.string().uuid().nullable();

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
    father_id: nullableUuid,
    mother_id: nullableUuid,
    is_placeholder: z.boolean(),
    photo_url: z.string().url().nullable(),
    notes_en: z.string().max(2000).nullable(),
    notes_ar: z.string().max(2000).nullable(),
  })
  .refine(
    (d) => d.given_en != null || d.given_ar != null || d.is_placeholder,
    {
      message: "At least one name (English or Arabic) is required",
      path: ["given_en"],
    },
  );

export type PersonInput = z.infer<typeof personSchema>;
