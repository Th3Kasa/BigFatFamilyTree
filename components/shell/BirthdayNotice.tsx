"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Cake, ChevronUp, Minus } from "lucide-react";
import { useFamilyDirectory } from "@/lib/client/family-directory";
import { birthdayTurns, birthdayWhen, upcomingBirthdays, type UpcomingBirthday } from "@/lib/people/birthdays";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { getDisplayName } from "@/lib/utils";
import type { DirectoryPerson } from "@/lib/client/family-directory";

// Minimised for the rest of this browser tab's visit; a new visit shows the note again.
const MIN_KEY = "bft.birthdays.minimised";

function readMinimised() {
  try {
    return sessionStorage.getItem(MIN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMinimised(value: boolean) {
  try {
    if (value) sessionStorage.setItem(MIN_KEY, "1");
    else sessionStorage.removeItem(MIN_KEY);
  } catch {
    // Storage blocked: the note just opens again on the next page load.
  }
}

/**
 * Floating note announcing this week's and this month's birthdays (living
 * people only). Opens on each visit; "Minimise" shrinks it to a small cake
 * pill for the rest of the visit. Renders nothing when no birthdays are due.
 */
export function BirthdayNotice({ lang }: { lang: "ar" | "en" }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const dir = useFamilyDirectory(true);
  const reduce = useReducedMotion();
  const [today] = useState(() => new Date());
  const [minimised, setMinimised] = useState(readMinimised);
  const titleId = useId();
  const panelId = useId();

  if (!dir) return null;
  const { week, month } = upcomingBirthdays(dir.people, today);
  const total = week.length + month.length;
  if (total === 0) return null;

  const toggle = (next: boolean) => {
    setMinimised(next);
    writeMinimised(next);
  };

  const pillLabel =
    week.length > 0
      ? t(`${week.length} birthday${week.length === 1 ? "" : "s"} this week`, `أعياد ميلاد هذا الأسبوع: ${week.length}`)
      : t(`${month.length} birthday${month.length === 1 ? "" : "s"} this month`, `أعياد ميلاد هذا الشهر: ${month.length}`);

  return (
    <div className="pointer-events-none fixed end-3 top-[calc(var(--topbar-h)+0.75rem)] z-30 flex justify-end sm:end-5">
      <AnimatePresence mode="wait" initial={false}>
        {minimised ? (
          <motion.button
            key="pill"
            type="button"
            onClick={() => toggle(false)}
            aria-expanded={false}
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow-floating)] hover:bg-[#FBF7F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Cake aria-hidden className="h-4 w-4 text-[var(--primary)]" strokeWidth={2.25} />
            {pillLabel}
          </motion.button>
        ) : (
          <motion.section
            key="panel"
            id={panelId}
            aria-labelledby={titleId}
            onKeyDown={(e) => {
              if (e.key === "Escape") toggle(true);
            }}
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
            className="pointer-events-auto flex max-h-[min(28rem,calc(100svh-var(--topbar-h)-var(--tabbar-h)-2rem))] w-[min(21rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-deep)]"
          >
            <header className="flex items-center gap-2.5 border-b border-[var(--border)] py-2 pe-2 ps-4">
              <Cake aria-hidden className="h-5 w-5 shrink-0 text-[var(--primary)]" strokeWidth={2.25} />
              <h2 id={titleId} className="flex-1 font-[family-name:var(--font-display)] text-[17px] font-bold">
                {t("Family birthdays", "أعياد ميلاد العائلة")}
              </h2>
              <button
                type="button"
                onClick={() => toggle(true)}
                aria-expanded
                aria-controls={panelId}
                aria-label={t("Minimise birthdays", "تصغير أعياد الميلاد")}
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[#F4EDEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <Minus aria-hidden className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </header>
            <div className="overflow-y-auto px-2 pb-2">
              {week.length > 0 && (
                <BirthdayGroup title={t("This week", "هذا الأسبوع")} list={week} today={today} lang={lang} />
              )}
              {month.length > 0 && (
                <BirthdayGroup title={t("Later this month", "لاحقًا هذا الشهر")} list={month} today={today} lang={lang} />
              )}
            </div>
            <button
              type="button"
              onClick={() => toggle(true)}
              className="flex min-h-11 items-center justify-center gap-1.5 border-t border-[var(--border)] text-sm font-semibold text-[var(--muted-foreground)] hover:bg-[#FBF7F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
            >
              <ChevronUp aria-hidden className="h-4 w-4" strokeWidth={2.5} />
              {t("Minimise", "تصغير")}
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function BirthdayGroup({
  title,
  list,
  today,
  lang,
}: {
  title: string;
  list: UpcomingBirthday<DirectoryPerson>[];
  today: Date;
  lang: "ar" | "en";
}) {
  return (
    <div className="pt-3">
      <h3 className="px-2 pb-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{title}</h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((b) => {
          const name = getDisplayName(b.person, lang);
          const when = birthdayWhen(b, today, lang);
          const turns = birthdayTurns(b, lang);
          const isToday = b.daysAway === 0;
          return (
            <li key={b.person.id}>
              <Link
                href={`/person/${b.person.slug ?? b.person.id}`}
                className="flex min-h-11 items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-[#FBF7F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <PersonAvatar person={b.person} lang={lang} className="h-9 w-9" textClassName="text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{name}</span>
                  {turns && <span className="block text-[13px] text-[var(--muted-foreground)]">{turns}</span>}
                </span>
                <span
                  className={
                    isToday
                      ? "shrink-0 rounded-full bg-[#F7E7EB] px-2.5 py-1 text-xs font-bold text-[var(--primary)]"
                      : "shrink-0 text-[13px] font-semibold text-[var(--muted-foreground)]"
                  }
                >
                  {isToday ? `🎉 ${when}` : when}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
