// Pure: which PIN account does "first name (+ optional last name / birthday)" mean?
// Used by the new-device sign-in (first name + PIN). Kept free of I/O for testing.

import { makeNameKey, normaliseName } from "@/lib/auth/pin-validation";

export type PinCandidate = {
  id: string;
  first_name: string | null;
  name_key: string | null;
  date_of_birth: string | null;
};

export type ResolvedCandidate = PinCandidate & { name_key: string; date_of_birth: string };

export type Resolution =
  | { kind: "none" }
  | { kind: "one"; profile: ResolvedCandidate }
  /** More than one person has this first name and no birthday was given. */
  | { kind: "need_birthday" }
  /** Same first name AND birthday (or a name with no last name given): ask for the last name. */
  | { kind: "need_last_name" };

/** The key the first-name rate limiter and matching use: the same normaliser as name_key. */
export function firstNameKey(firstName: string): string {
  return normaliseName(firstName);
}

/**
 * @param candidates every PIN account (id, first_name, name_key, date_of_birth)
 * @param given what the person typed; lastName / dateOfBirth may be empty or missing
 *
 * A birthday supplied for a unique first name must also match (otherwise "none"),
 * so a wrong birthday is a mismatch, never a quiet sign-in as someone else.
 */
export function resolvePinCandidates(
  candidates: PinCandidate[],
  given: { firstName: string; lastName?: string | null; dateOfBirth?: string | null },
): Resolution {
  const fkey = firstNameKey(given.firstName);
  const wantedKey = given.lastName ? makeNameKey(given.firstName, given.lastName) : null;
  const dob = given.dateOfBirth || null;

  const matches = candidates.filter(
    (c): c is ResolvedCandidate =>
      !!c.first_name &&
      !!c.name_key &&
      !!c.date_of_birth &&
      normaliseName(c.first_name) === fkey &&
      (wantedKey === null || c.name_key === wantedKey) &&
      (dob === null || c.date_of_birth === dob),
  );

  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", profile: matches[0] };
  return dob === null ? { kind: "need_birthday" } : { kind: "need_last_name" };
}
