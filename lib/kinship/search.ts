// Name search for the relationship finder's pickers.
// Matches English and Arabic names, ignoring case, Arabic diacritics and the
// usual spelling variants (أ/إ/آ → ا, ة → ه, ى → ي) so "احمد" finds "أحمد".

type Nameable = {
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
};

export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "") // Latin accents, Arabic harakat, tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function haystack(p: Nameable): string {
  return normalizeForSearch([p.given_en, p.family_name_en, p.given_ar, p.family_name_ar].filter(Boolean).join(" "));
}

/** Every word typed must appear somewhere in the person's names. Empty query matches everyone. */
export function matchesQuery(p: Nameable, query: string): boolean {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = haystack(p);
  return words.every((w) => hay.includes(w));
}

/**
 * Filters and ranks people for a query: names that *start* with the first word
 * come before names that merely contain it. Stable otherwise.
 */
export function searchPeople<T extends Nameable>(people: T[], query: string, limit = 50): T[] {
  const first = normalizeForSearch(query).split(" ")[0] ?? "";
  const hits = people.filter((p) => matchesQuery(p, query));
  if (!first) return hits.slice(0, limit);
  const startsWith = (p: T) =>
    [p.given_en, p.given_ar, p.family_name_en, p.family_name_ar].some((n) => !!n && normalizeForSearch(n).startsWith(first));
  const ranked = [...hits.filter(startsWith), ...hits.filter((p) => !startsWith(p))];
  return ranked.slice(0, limit);
}
