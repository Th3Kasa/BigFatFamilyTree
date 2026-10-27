// Turn raw `people` rows into the PersonSummary shape used by the finder and
// admin pickers (name, birth year, "son of X & Y"). Pure, no I/O.

import { birthYearOf } from "./match";
import type { Gender, PersonSummary } from "./types";

/** Columns every caller must select from `people` to build summaries. */
export const PERSON_SUMMARY_COLUMNS =
  "id, slug, given_en, given_ar, family_name_en, family_name_ar, gender, birth_date, father_id, mother_id, father_name_en, father_name_ar";

export type PersonRow = {
  id: string;
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  gender: Gender;
  birth_date: string | null;
  father_id: string | null;
  mother_id: string | null;
  father_name_en?: string | null;
  father_name_ar?: string | null;
};

type ParentLookup = Map<string, { given_en: string | null; given_ar: string | null }>;

function toName(
  p: { given_en: string | null; given_ar: string | null } | undefined,
): { en: string; ar: string } | null {
  if (!p) return null;
  const en = (p.given_en ?? "").trim();
  const ar = (p.given_ar ?? "").trim();
  if (!en && !ar) return null;
  return { en: en || ar, ar: ar || en };
}

export function buildPersonSummary(row: PersonRow, parents: ParentLookup): PersonSummary {
  const father =
    toName(row.father_id ? parents.get(row.father_id) : undefined) ??
    toName({ given_en: row.father_name_en ?? null, given_ar: row.father_name_ar ?? null });
  const mother = toName(row.mother_id ? parents.get(row.mother_id) : undefined);
  return {
    id: row.id,
    slug: row.slug,
    given_en: row.given_en,
    given_ar: row.given_ar,
    family_name_en: row.family_name_en,
    family_name_ar: row.family_name_ar,
    gender: row.gender,
    birth_date: row.birth_date,
    birthYear: birthYearOf(row.birth_date),
    fatherName: father,
    motherName: mother,
  };
}
