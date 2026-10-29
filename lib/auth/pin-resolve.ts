// Pure: which PIN account does "first name (+ optional last name / birthday)" mean?
// Used by the new-device sign-in (first name + PIN) and by join (is this first
// name taken?). Kept free of I/O for testing.

import { makeNameKey, normaliseName } from "@/lib/auth/pin-validation";

export type PinCandidate = {
  id: string;
  first_name: string | null;
  name_key: string | null;
  date_of_birth: string | null;
};

export type ResolvedCandidate = PinCandidate & { name_key: string };

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

/** PIN accounts whose first name normalises to the same key. */
export function sameFirstName(candidates: PinCandidate[], firstName: string): ResolvedCandidate[] {
  const fkey = firstNameKey(firstName);
  return candidates.filter(
    (c): c is ResolvedCandidate => !!c.first_name && !!c.name_key && normaliseName(c.first_name) === fkey,
  );
}

/**
 * @param candidates every PIN account (id, first_name, name_key, date_of_birth)
 * @param given what the person typed; lastName / dateOfBirth may be empty or missing
 *
 * A birthday supplied for a unique first name must also match (otherwise "none"),
 * so a wrong birthday is a mismatch, never a quiet sign-in as someone else.
 *
 * Accounts that joined without a birthday (their first name was free then) have
 * none to match. When a birthday is given and no account has it, the one
 * birthday-less account with that first name is tried. Join keeps it at most one,
 * and the PIN and that account's lockout still apply, so this is no weaker than
 * that member's own "first name + PIN".
 */
export function resolvePinCandidates(
  candidates: PinCandidate[],
  given: { firstName: string; lastName?: string | null; dateOfBirth?: string | null },
): Resolution {
  const wantedKey = given.lastName ? makeNameKey(given.firstName, given.lastName) : null;
  const dob = given.dateOfBirth || null;

  const byName = sameFirstName(candidates, given.firstName).filter((c) => wantedKey === null || c.name_key === wantedKey);

  if (dob === null) {
    if (byName.length === 0) return { kind: "none" };
    if (byName.length === 1) return { kind: "one", profile: byName[0] };
    return { kind: "need_birthday" };
  }

  const exact = byName.filter((c) => c.date_of_birth === dob);
  if (exact.length === 1) return { kind: "one", profile: exact[0] };
  if (exact.length > 1) return { kind: "need_last_name" };

  const noBirthday = byName.filter((c) => !c.date_of_birth);
  return noBirthday.length === 1 ? { kind: "one", profile: noBirthday[0] } : { kind: "none" };
}

export type JoinNameCheck = { kind: "free" } | { kind: "need_birthday" } | { kind: "taken" };

/**
 * Can someone join with this first name (and optional birthday)?
 *  * nobody has the first name: free (birthday optional);
 *  * somebody has it: a birthday is required, and must differ from theirs.
 */
export function checkJoinName(candidates: PinCandidate[], firstName: string, dateOfBirth?: string | null): JoinNameCheck {
  const same = sameFirstName(candidates, firstName);
  if (same.length === 0) return { kind: "free" };
  if (!dateOfBirth) return { kind: "need_birthday" };
  return same.some((c) => c.date_of_birth === dateOfBirth) ? { kind: "taken" } : { kind: "free" };
}
