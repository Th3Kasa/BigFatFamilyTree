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

/** Name words, one list per script: "Nageeb (James) Mansour" → [nageeb, james, mansour]. */
function nameWords(p: Nameable): string[][] {
  const words = (...parts: (string | null | undefined)[]) =>
    normalizeForSearch(parts.filter(Boolean).join(" ")).split(/[\s\-()'.,،]+/).filter(Boolean);
  return [words(p.given_en, p.family_name_en), words(p.given_ar, p.family_name_ar)].filter((w) => w.length > 0);
}

const queryWords = (query: string) => normalizeForSearch(query).split(/[\s\-()'.,،]+/).filter(Boolean);

/**
 * How well `words` (typed) fit `name` (one script's name words): every typed
 * word must claim a different name word, so "Mansour Mansour" needs two
 * Mansours. 2 = every word starts a name word, 1 = some only appear inside a
 * name word, 0 = no fit. Longest typed words claim first so a short prefix
 * cannot take the name word a longer one needs.
 */
function fit(words: string[], name: string[]): 0 | 1 | 2 {
  const used = new Set<number>();
  let score: 1 | 2 = 2;
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    let i = name.findIndex((n, k) => !used.has(k) && n.startsWith(w));
    if (i < 0) {
      i = name.findIndex((n, k) => !used.has(k) && n.includes(w));
      score = 1;
    }
    if (i < 0) return 0;
    used.add(i);
  }
  return score;
}

/**
 * Match rank for a query (lower is better), or null for no match:
 *   0 full name typed exactly ("Mansour Mansour")
 *   1 the first typed word starts the given name and every word starts a name word
 *   2 every typed word starts a name word (e.g. the family name)
 *   3 some typed words only appear inside a name word
 */
function rank(p: Nameable, words: string[]): number | null {
  if (words.length === 0) return 2;
  let best: number | null = null;
  for (const name of nameWords(p)) {
    const f = fit(words, name);
    if (f === 0) continue;
    let r = f === 2 ? 2 : 3;
    if (f === 2 && name[0].startsWith(words[0])) r = 1;
    if (words.length === name.length && words.every((w, i) => w === name[i])) r = 0;
    best = best == null ? r : Math.min(best, r);
  }
  return best;
}

/** Every typed word must match a different word of the person's name. Empty query matches everyone. */
export function matchesQuery(p: Nameable, query: string): boolean {
  return rank(p, queryWords(query)) != null;
}

/**
 * Filters and ranks people for a query: the exact full name first, then
 * people whose given name starts with what was typed, then other word-start
 * matches, then matches inside a word. Stable (keeps the incoming order,
 * alphabetical from the server) within each rank. No limit unless one is given.
 */
export function searchPeople<T extends Nameable>(people: T[], query: string, limit = Infinity): T[] {
  const words = queryWords(query);
  const ranked: { p: T; r: number; i: number }[] = [];
  people.forEach((p, i) => {
    const r = rank(p, words);
    if (r != null) ranked.push({ p, r, i });
  });
  ranked.sort((a, b) => a.r - b.r || a.i - b.i);
  return ranked.slice(0, limit).map((x) => x.p);
}
