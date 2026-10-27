/**
 * Small, pure helpers for showing a person: initials, a deterministic soft
 * avatar colour, life years, and friendly event dates. Shared by the tree,
 * the people directory, search and the profile so they always agree.
 */

import { getNameParts, type NameablePerson } from "@/lib/utils";

export type Lang = "ar" | "en";

/** Soft background + readable ink. Every pair is at least 6:1 (WCAG AA). */
export const AVATAR_TONES = [
  { bg: "#DDE7F1", fg: "#1F4467" },
  { bg: "#F7E7EB", fg: "#7A1631" },
  { bg: "#E3EEDF", fg: "#2F5A27" },
  { bg: "#EFE3D3", fg: "#6A4A1F" },
  { bg: "#E9D4C4", fg: "#5C3A21" },
  { bg: "#E8E1F2", fg: "#4A3470" },
] as const;

export type AvatarTone = (typeof AVATAR_TONES)[number];

/** FNV-1a: tiny, stable string hash, so a person keeps their colour everywhere. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function avatarTone(seed: string): AvatarTone {
  return AVATAR_TONES[hash(seed) % AVATAR_TONES.length];
}

/** Up to two initials from the given and family names ("?" when nameless). */
export function initialsOf(p: NameablePerson | null | undefined, lang: Lang = "en"): string {
  const { given, family } = getNameParts(p, lang);
  const first = Array.from(given.trim())[0] ?? "";
  const last = Array.from(family.trim())[0] ?? "";
  const out = (first + last).toUpperCase();
  return out || "?";
}

function yearOf(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = /^(\d{4})/.exec(String(date));
  return m ? m[1] : null;
}

/** "1938 – 2019", "b. 1942", "d. 2001", or "" when no dates are known. */
export function lifeYears(
  birth: string | null | undefined,
  death: string | null | undefined,
  lang: Lang = "en",
): string {
  const b = yearOf(birth);
  const d = yearOf(death);
  if (b && d) return `${b} – ${d}`;
  if (b) return lang === "ar" ? `مواليد ${b}` : `b. ${b}`;
  if (d) return lang === "ar" ? `توفي ${d}` : `d. ${d}`;
  return "";
}

export type DatePrecision = "exact" | "year" | "decade" | "before" | "after" | "around";

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/**
 * A readable date for an event, honouring its precision:
 * exact → "12 March 1942", year → "1942", decade → "1940s",
 * before/after/around → "Before 1942". Returns null when there is no date.
 * Built by hand (not Intl) so server and client render identical text.
 */
export function formatEventDate(
  value: string | null | undefined,
  precision: DatePrecision | string | null | undefined,
  lang: Lang = "en",
): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  switch (precision) {
    case "year":
      return y;
    case "decade": {
      const decade = Math.floor(year / 10) * 10;
      return lang === "ar" ? `عقد ${decade}` : `${decade}s`;
    }
    case "before":
      return lang === "ar" ? `قبل ${y}` : `Before ${y}`;
    case "after":
      return lang === "ar" ? `بعد ${y}` : `After ${y}`;
    case "around":
      return lang === "ar" ? `حوالي ${y}` : `Around ${y}`;
    default: {
      const month = (lang === "ar" ? MONTHS_AR : MONTHS_EN)[Number(mo) - 1];
      if (!month) return y;
      return `${Number(d)} ${month} ${y}`;
    }
  }
}
