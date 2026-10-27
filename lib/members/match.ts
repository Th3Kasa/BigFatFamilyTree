// Pure helpers for "find yourself in the tree": parse the (messy, text) birth
// dates stored on people, score name matches, and rank candidates so the most
// likely "this is me" is on top. No I/O, fully unit-tested.

import type { DobMatch, Gender, PersonSummary } from "./types";

export type BirthParts = { year: number; month?: number; day?: number };

const EASTERN_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => EASTERN_DIGITS[d] ?? d);
}

function validYear(y: number): boolean {
  return y >= 1000 && y <= 2999;
}

/**
 * people.birth_date is free text. Understands ISO ("1998-04-12", "1998-04",
 * "1998"), day-first ("12/04/1998", Australian order) and falls back to the
 * first 4-digit year found ("c. 1950"). Returns null when nothing usable.
 */
export function parseBirthDate(raw: string | null | undefined): BirthParts | null {
  if (!raw) return null;
  const s = toAsciiDigits(raw).trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (validYear(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { year: y, month: mo, day: d };
    if (validYear(y)) return { year: y };
    return null;
  }
  m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    if (validYear(y) && mo >= 1 && mo <= 12) return { year: y, month: mo };
    if (validYear(y)) return { year: y };
    return null;
  }
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (validYear(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { year: y, month: mo, day: d };
    if (validYear(y)) return { year: y };
    return null;
  }
  m = /\b(1\d{3}|2\d{3})\b/.exec(s);
  if (m) return { year: Number(m[1]) };
  return null;
}

export function birthYearOf(raw: string | null | undefined): number | null {
  return parseBirthDate(raw)?.year ?? null;
}

/** dob is the member's typed date of birth as ISO "YYYY-MM-DD". */
export function dobMatchLevel(
  personBirth: string | null | undefined,
  dob: string | null | undefined,
): DobMatch {
  const mine = parseBirthDate(dob);
  const theirs = parseBirthDate(personBirth);
  if (!mine || !theirs) return "none";
  if (mine.year !== theirs.year) return "none";
  if (
    mine.month !== undefined && mine.day !== undefined &&
    theirs.month === mine.month && theirs.day === mine.day
  ) {
    return "exact";
  }
  return "year";
}

// ── names ────────────────────────────────────────────────────────────────────

/** Lowercase, strip diacritics / Arabic tashkeel and unify look-alike letters. */
export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآٱ]/g, "ا") // alef variants -> alef
    .replace(/ى/g, "ي") // alef maqsura -> yeh
    .replace(/ة/g, "ه") // teh marbuta -> heh
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string | null | undefined): string[] {
  const n = normalizeName(s);
  return n ? n.split(" ") : [];
}

export type RankablePerson = {
  given_en?: string | null;
  given_ar?: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
  father_name_en?: string | null;
  father_name_ar?: string | null;
  grandfather_name_en?: string | null;
  grandfather_name_ar?: string | null;
  great_grandfather_name_en?: string | null;
  great_grandfather_name_ar?: string | null;
  birth_date?: string | null;
};

/**
 * 0 = no overlap. Exact token hits on given/family name weigh most, then other
 * name-chain fields, then prefix hits ("Moh" -> "Mohammed"). A small bonus when
 * every typed word found a home.
 */
export function nameScore(query: string, p: RankablePerson): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;

  const primary = new Set([
    ...tokenize(p.given_en), ...tokenize(p.given_ar),
    ...tokenize(p.family_name_en), ...tokenize(p.family_name_ar),
  ]);
  const secondary = new Set([
    ...tokenize(p.father_name_en), ...tokenize(p.father_name_ar),
    ...tokenize(p.grandfather_name_en), ...tokenize(p.grandfather_name_ar),
    ...tokenize(p.great_grandfather_name_en), ...tokenize(p.great_grandfather_name_ar),
  ]);

  let score = 0;
  let matched = 0;
  for (const q of qTokens) {
    let best = 0;
    if (primary.has(q)) best = 3;
    else if (secondary.has(q)) best = 2;
    else if (q.length >= 2) {
      for (const t of primary) if (t.startsWith(q)) { best = Math.max(best, 1); break; }
      if (best === 0) for (const t of secondary) if (t.startsWith(q)) { best = 1; break; }
    }
    if (best > 0) matched += 1;
    score += best;
  }
  if (score > 0 && matched === qTokens.length) score += 2;
  return score;
}

const DOB_ORDER: Record<DobMatch, number> = { exact: 0, year: 1, none: 2 };

export type Ranked<T> = T & { dobMatch: DobMatch; score: number };

/**
 * Order: exact birth date first, then same birth year, then everything else;
 * ties broken by how well the name matches, then alphabetically.
 *
 * Who is included: anyone whose name overlaps the query, plus anyone with the
 * *exact* birth date (a different spelling of the same person). A same-year
 * match with no name overlap is noise and is dropped.
 */
export function rankCandidates<T extends RankablePerson>(
  people: T[],
  opts: { query: string; dob?: string | null },
): Ranked<T>[] {
  const out: Ranked<T>[] = [];
  for (const p of people) {
    const score = nameScore(opts.query, p);
    const dobMatch = dobMatchLevel(p.birth_date, opts.dob);
    if (score === 0 && dobMatch !== "exact") continue;
    out.push({ ...p, score, dobMatch });
  }
  const label = (p: RankablePerson) =>
    `${p.given_en ?? p.given_ar ?? ""} ${p.family_name_en ?? p.family_name_ar ?? ""}`.trim();
  out.sort(
    (a, b) =>
      DOB_ORDER[a.dobMatch] - DOB_ORDER[b.dobMatch] ||
      b.score - a.score ||
      label(a).localeCompare(label(b)),
  );
  return out;
}

// ── presentation ─────────────────────────────────────────────────────────────

type ParentName = { en: string; ar: string } | null;

function pickName(n: ParentName, lang: "ar" | "en"): string {
  if (!n) return "";
  return (lang === "ar" ? n.ar || n.en : n.en || n.ar).trim();
}

/** "son of Elias & Rania" / "ابن إلياس و رانيا". Null when no parent is known. */
export function formatParentage(
  p: { gender: Gender; fatherName: ParentName; motherName: ParentName },
  lang: "ar" | "en",
): string | null {
  const names = [pickName(p.fatherName, lang), pickName(p.motherName, lang)].filter(Boolean);
  if (names.length === 0) return null;
  if (lang === "ar") {
    const rel = p.gender === "m" ? "ابن" : p.gender === "f" ? "ابنة" : "من أبناء";
    return `${rel} ${names.join(" و ")}`;
  }
  const rel = p.gender === "m" ? "son of" : p.gender === "f" ? "daughter of" : "child of";
  return `${rel} ${names.join(" & ")}`;
}

/** "b. 1998 · son of Elias & Rania" */
export function formatPersonSubline(p: PersonSummary, lang: "ar" | "en"): string {
  const parts: string[] = [];
  if (p.birthYear) parts.push(lang === "ar" ? `مواليد ${p.birthYear}` : `b. ${p.birthYear}`);
  const parentage = formatParentage(p, lang);
  if (parentage) parts.push(parentage);
  return parts.join(" · ");
}

const ARABIC_RE = /[؀-ۿݐ-ݿ]/;
export function hasArabic(s: string): boolean {
  return ARABIC_RE.test(s);
}

/**
 * Split a typed full name into given + family for creating a person. First word
 * is the given name, last word the family name; middle words are left for the
 * admin to place (the original text is also kept in the person's notes).
 */
export function splitFullName(fullName: string): { given: string; family: string | null } {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { given: "", family: null };
  if (words.length === 1) return { given: words[0], family: null };
  return { given: words[0], family: words[words.length - 1] };
}

/** Value to store in people.birth_date for a member's typed DOB (ISO). */
export function dobToBirthDateText(dob: string | null | undefined): string | null {
  const parts = parseBirthDate(dob);
  if (!parts || parts.month === undefined || parts.day === undefined) return null;
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}
