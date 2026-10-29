/**
 * Upcoming birthdays for the birthday notice: living people only, split into
 * the next seven days and the rest of this calendar month. Pure, so the day
 * boundaries can be tested; the caller passes "today" in the viewer's own time.
 */

import type { Lang } from "@/lib/people/display";

type BirthdayPerson = {
  birth_date: string | null;
  death_date: string | null;
};

export type UpcomingBirthday<P> = {
  person: P;
  month: number;
  day: number;
  /** 0 = today, 1 = tomorrow, … */
  daysAway: number;
  /** Age they turn, when the birth year is known. */
  turns: number | null;
};

export type UpcomingBirthdays<P> = {
  /** Today and the next six days. */
  week: UpcomingBirthday<P>[];
  /** Later this calendar month, after the first seven days. */
  month: UpcomingBirthday<P>[];
};

const DAY_MS = 86_400_000;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Whole days between two calendar dates, ignoring clocks and daylight saving. */
const dayNumber = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / DAY_MS;

function parseBirth(value: string | null): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const daysInMonth = new Date(Date.UTC(2000, month, 0)).getUTCDate(); // 2000 is a leap year, so 29 Feb is allowed
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  return { year, month, day };
}

export function upcomingBirthdays<P extends BirthdayPerson>(people: P[], today: Date): UpcomingBirthdays<P> {
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  const todayN = dayNumber(ty, tm, td);
  const week: UpcomingBirthday<P>[] = [];
  const month: UpcomingBirthday<P>[] = [];

  for (const person of people) {
    if (person.death_date?.trim()) continue;
    const birth = parseBirth(person.birth_date);
    if (!birth) continue;

    // The next time the birthday comes round (today counts). 29 Feb is kept on 28 Feb in other years.
    let year = ty;
    const dayIn = (y: number) => (birth.month === 2 && birth.day === 29 && !isLeap(y) ? 28 : birth.day);
    if (dayNumber(year, birth.month, dayIn(year)) < todayN) year += 1;
    const day = dayIn(year);
    const daysAway = dayNumber(year, birth.month, day) - todayN;

    const turns = birth.year >= 1000 && year > birth.year ? year - birth.year : null;
    const entry = { person, month: birth.month, day, daysAway, turns };
    if (daysAway < 7) week.push(entry);
    else if (year === ty && birth.month === tm) month.push(entry);
  }

  week.sort((a, b) => a.daysAway - b.daysAway);
  month.sort((a, b) => a.daysAway - b.daysAway);
  return { week, month };
}

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** "Today", "Tomorrow" or "Sat 1 Nov" (built by hand, like formatEventDate). */
export function birthdayWhen(b: UpcomingBirthday<unknown>, today: Date, lang: Lang): string {
  if (b.daysAway === 0) return lang === "ar" ? "اليوم" : "Today";
  if (b.daysAway === 1) return lang === "ar" ? "غدًا" : "Tomorrow";
  const weekday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + b.daysAway).getDay();
  return lang === "ar"
    ? `${WEEKDAYS_AR[weekday]} ${b.day} ${MONTHS_AR[b.month - 1]}`
    : `${WEEKDAYS_EN[weekday]} ${b.day} ${MONTHS_EN[b.month - 1]}`;
}

/** "turns 40" / "يكمل 40 عامًا", or "" when the year is unknown. */
export function birthdayTurns(b: UpcomingBirthday<unknown>, lang: Lang): string {
  if (b.turns == null) return "";
  return lang === "ar" ? `يكمل ${b.turns} عامًا` : `turns ${b.turns}`;
}
