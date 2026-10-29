// Pure helpers for the three-dropdown date of birth (day / month / year).

import { isRealIsoDate, MIN_DOB, todayIso } from "@/lib/validation/members";

export const MONTH_NAMES = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
} as const;

export type DobParts = { day: string; month: string; year: string };

export const EMPTY_DOB: DobParts = { day: "", month: "", year: "" };

const MIN_YEAR = Number(MIN_DOB.slice(0, 4));

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** month is 1-12. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Newest first: the current year down to 1900. */
export function yearOptions(currentYear: number = new Date().getFullYear()): number[] {
  const out: number[] = [];
  for (let y = currentYear; y >= MIN_YEAR; y--) out.push(y);
  return out;
}

/** "1990-04-12" -> parts; anything else -> empty parts. */
export function partsFromIso(iso: string): DobParts {
  if (!isRealIsoDate(iso)) return EMPTY_DOB;
  return { year: String(Number(iso.slice(0, 4))), month: String(Number(iso.slice(5, 7))), day: String(Number(iso.slice(8, 10))) };
}

export type DobCheck =
  | { status: "incomplete" }
  | { status: "invalid"; code: "dob_invalid" | "dob_future" }
  | { status: "ok"; iso: string };

/** Validate the three selects. Impossible dates (31 Feb, 29 Feb in a non-leap year) are "invalid". */
export function checkDobParts(parts: DobParts, today: string = todayIso()): DobCheck {
  if (!parts.day || !parts.month || !parts.year) return { status: "incomplete" };
  const d = Number(parts.day);
  const m = Number(parts.month);
  const y = Number(parts.year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return { status: "invalid", code: "dob_invalid" };
  if (m < 1 || m > 12 || y < MIN_YEAR || d < 1 || d > daysInMonth(y, m)) return { status: "invalid", code: "dob_invalid" };
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (!isRealIsoDate(iso) || iso < MIN_DOB) return { status: "invalid", code: "dob_invalid" };
  if (iso > today) return { status: "invalid", code: "dob_future" };
  return { status: "ok", iso };
}
