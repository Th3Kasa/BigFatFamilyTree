// What the account menu shows for the signed-in member: their tree card's photo
// and name when the account is linked, so the account and the card always match.
// Pure, so it is unit-tested.

import type { CurrentPerson } from "./types";

type AccountUser = {
  email?: string | null;
  user_metadata?: { full_name?: unknown; name?: unknown; avatar_url?: unknown } | null;
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const firstLetter = (s: string | null | undefined) => Array.from(s ?? "")[0] ?? "";

export function accountAvatar(user: AccountUser, person: CurrentPerson | null): { photo: string | null; initials: string } {
  const photo = person?.photo_url || text(user.user_metadata?.avatar_url);

  const given = text(person?.given_en) ?? text(person?.given_ar);
  if (given) {
    const family = text(person?.family_name_en) ?? text(person?.family_name_ar);
    return { photo, initials: (firstLetter(given) + firstLetter(family)).toUpperCase() };
  }
  const name = text(user.user_metadata?.full_name) ?? text(user.user_metadata?.name);
  if (name) {
    const parts = name.split(/\s+/);
    return { photo, initials: (firstLetter(parts[0]) + firstLetter(parts[1])).toUpperCase() };
  }
  return { photo, initials: (user.email ?? "?").slice(0, 2).toUpperCase() };
}
