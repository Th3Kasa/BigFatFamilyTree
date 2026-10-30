/**
 * Birth and death dates where only part is known. Stored in people.birth_date /
 * death_date as ISO prefixes: "1917" (year only), "1917-05" (month and year)
 * or "1917-05-12" (exact). Every reader that takes the leading year
 * (lifeYears, sorting, member matching) already understands all three.
 */

import type { Lang } from "@/lib/people/display";

export type PartialDate = { year: string; month: string; day: string };

export const EMPTY_DATE: PartialDate = { year: "", month: "", day: "" };

/** "1917-05" → { year: "1917", month: "5", day: "" }. Anything else → empty. */
export function parsePartialDate(value: string | null | undefined): PartialDate {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value?.trim() ?? "");
  if (!m) return EMPTY_DATE;
  return { year: m[1], month: m[2] ? String(Number(m[2])) : "", day: m[3] ? String(Number(m[3])) : "" };
}

const pad = (n: string) => n.padStart(2, "0");

export function daysInMonth(year: string, month: string): number {
  const y = /^\d{4}$/.test(year) ? Number(year) : 2000; // unknown year: allow 29 Feb
  return new Date(Date.UTC(y, Number(month), 0)).getUTCDate();
}

/**
 * The value to store: "" until a 4-digit year is typed; a day without a month
 * is dropped; a day past the end of the month is dropped.
 */
export function composePartialDate(d: PartialDate): string {
  if (!/^\d{4}$/.test(d.year)) return "";
  if (!d.month) return d.year;
  const ym = `${d.year}-${pad(d.month)}`;
  if (!d.day || Number(d.day) > daysInMonth(d.year, d.month)) return ym;
  return `${ym}-${pad(d.day)}`;
}

/** True for "", "1917", "1917-05" and real "1917-05-12" dates. */
export function isPartialDate(value: string): boolean {
  if (value === "") return true;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!m) return false;
  if (!m[2]) return true;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return false;
  return !m[3] || (Number(m[3]) >= 1 && Number(m[3]) <= daysInMonth(m[1], String(month)));
}

export const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** "12 May 1917", "May 1917" or "1917"; null when there is no usable date. */
export function formatPartialDate(value: string | null | undefined, lang: Lang = "en"): string | null {
  const d = parsePartialDate(value);
  if (!d.year) return null;
  if (!d.month) return d.year;
  const month = (lang === "ar" ? MONTHS_AR : MONTHS_EN)[Number(d.month) - 1];
  return d.day ? `${d.day} ${month} ${d.year}` : `${month} ${d.year}`;
}
