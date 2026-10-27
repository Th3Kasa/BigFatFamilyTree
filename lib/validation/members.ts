import { z } from "zod";

/** Today as YYYY-MM-DD in UTC (matches what <input type="date" max> compares against closely enough). */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const MIN_DOB = "1900-01-01";

export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(120, "That name is too long.")
  .refine((v) => /\p{L}/u.test(v), "Enter your full name.");

export const dobSchema = z
  .string()
  .trim()
  .refine(isRealIsoDate, "Enter a valid date of birth.")
  .refine((v) => v >= MIN_DOB, "Enter a valid date of birth.")
  .refine((v) => v <= todayIso(), "Date of birth can't be in the future.");

export const signUpProfileSchema = z.object({
  fullName: fullNameSchema,
  dateOfBirth: dobSchema,
});
export type SignUpProfileInput = z.infer<typeof signUpProfileSchema>;

const uuid = z.string().uuid();

export const searchClaimSchema = z.object({
  query: z.string().trim().max(120),
});

export const submitLinkRequestSchema = z.object({
  personId: uuid.nullable(),
  parentsNote: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type SubmitLinkRequestInput = z.input<typeof submitLinkRequestSchema>;

export const requestIdSchema = z.object({ requestId: uuid });
export const linkRequestToPersonSchema = z.object({ requestId: uuid, personId: uuid });
export const linkProfileSchema = z.object({ profileId: uuid, personId: uuid });
export const unlinkProfileSchema = z.object({ profileId: uuid });
export const memberRoleSchema = z.object({
  profileId: uuid,
  role: z.enum(["admin", "editor", "viewer"]),
});

const optionalText = z
  .string()
  .trim()
  .max(120)
  .nullish()
  .transform((v) => (v ? v : null));

const optionalUuid = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(uuid.nullable());

export const addFamilyMemberSchema = z
  .object({
    given_en: optionalText,
    given_ar: optionalText,
    family_name_en: optionalText,
    family_name_ar: optionalText,
    gender: z.enum(["m", "f", "unknown"]),
    birth_date: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (isRealIsoDate(v) && v <= todayIso()), "Enter a valid date."),
    father_id: optionalUuid,
    mother_id: optionalUuid,
  })
  .refine((d) => d.given_en !== null || d.given_ar !== null, {
    message: "Enter a first name in English or Arabic.",
    path: ["given_en"],
  });
export type AddFamilyMemberInput = z.infer<typeof addFamilyMemberSchema>;
