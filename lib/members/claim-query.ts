// Input rules + row mapping for public.search_people_for_claim(q, dob) and
// public.my_pending_claim_person(). The SQL re-checks everything; this is the
// friendly first line so we never call the RPC with junk.

import { isRealIsoDate, MIN_DOB, todayIso } from "@/lib/validation/members";
import type { ClaimCandidate, DobMatch, PersonSummary } from "./types";

export const CLAIM_QUERY_MIN = 2;
export const CLAIM_QUERY_MAX = 120;
export const CLAIM_RESULT_LIMIT = 20;

export type ClaimRpcInput = { q: string; dob: string | null };

/** Trim, enforce the 2..120 character window, and drop an unusable date of birth. */
export function normalizeClaimQuery(
  rawQuery: unknown,
  rawDob: unknown,
  today: string = todayIso(),
): { ok: true; input: ClaimRpcInput } | { ok: false; reason: "too_short" } {
  const q = (typeof rawQuery === "string" ? rawQuery : "").trim().slice(0, CLAIM_QUERY_MAX).trim();
  // At least one letter or digit, otherwise the SQL tokenizer finds nothing anyway.
  if (q.length < CLAIM_QUERY_MIN || !/[\p{L}\p{N}]/u.test(q)) return { ok: false, reason: "too_short" };
  const dob =
    typeof rawDob === "string" && isRealIsoDate(rawDob) && rawDob >= MIN_DOB && rawDob <= today
      ? rawDob
      : null;
  return { ok: true, input: { q, dob } };
}

export type ClaimRow = {
  id: string;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  birth_year: number | null;
  father_name_en: string | null;
  father_name_ar: string | null;
  mother_name_en: string | null;
  mother_name_ar: string | null;
  dob_match?: string | null;
};

function parent(en: string | null, ar: string | null): { en: string; ar: string } | null {
  const e = (en ?? "").trim();
  const a = (ar ?? "").trim();
  if (!e && !a) return null;
  return { en: e || a, ar: a || e };
}

function dobMatch(v: string | null | undefined): DobMatch {
  return v === "exact" || v === "year" ? v : "none";
}

/** RPC row -> the summary the UI already renders. Slug, gender and full birth date are never available here. */
export function toPersonSummary(row: ClaimRow): PersonSummary {
  return {
    id: row.id,
    slug: null,
    given_en: row.given_en,
    given_ar: row.given_ar,
    family_name_en: row.family_name_en,
    family_name_ar: row.family_name_ar,
    gender: "unknown",
    birth_date: null,
    birthYear: typeof row.birth_year === "number" ? row.birth_year : null,
    fatherName: parent(row.father_name_en, row.father_name_ar),
    motherName: parent(row.mother_name_en, row.mother_name_ar),
  };
}

export function toClaimCandidate(row: ClaimRow, claimed: ReadonlySet<string>): ClaimCandidate {
  return { ...toPersonSummary(row), dobMatch: dobMatch(row.dob_match), claimed: claimed.has(row.id) };
}
