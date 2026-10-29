"use client";

import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import { shell, useShell } from "@/lib/client/shell-store";
import {
  directoryName,
  matchPeople,
  useFamilyDirectory,
} from "@/lib/client/family-directory";
import { useFocusPerson } from "@/lib/client/use-focus-person";
import { lifeYears } from "@/lib/people/display";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { Lang } from "@/lib/lang/server";

/**
 * Mobile "Search" tab: a bottom sheet with a search field and the whole
 * family, A–Z. Tapping someone shows them on the tree.
 */
export function PeopleSheet({ lang }: { lang: Lang }) {
  const open = useShell((s) => s.peopleSheetOpen);
  const dir = useFamilyDirectory(open);
  const focusPerson = useFocusPerson();
  const [query, setQuery] = useState("");
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const list = useMemo(() => {
    if (!dir) return [];
    if (query.trim()) return matchPeople(dir.people, query, 200);
    return [...dir.people].sort((a, b) =>
      directoryName(a, lang).localeCompare(directoryName(b, lang), lang),
    );
  }, [dir, query, lang]);

  function close() {
    shell.setPeopleSheetOpen(false);
    setQuery("");
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? shell.setPeopleSheetOpen(true) : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(36_21_23/0.45)] md:hidden" />
        <DialogPrimitive.Content
          dir={lang === "ar" ? "rtl" : "ltr"}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85svh] flex-col rounded-t-[28px] bg-[var(--card)] pb-[env(safe-area-inset-bottom,0px)] shadow-[var(--shadow-deep)] focus:outline-none md:hidden"
        >
          <span aria-hidden className="mx-auto mt-2.5 h-[5px] w-11 rounded-full bg-[var(--border-strong)]" />
          <div className="flex items-center justify-between gap-3 px-4 pt-2">
            <DialogPrimitive.Title className="font-heading text-2xl font-bold text-[var(--foreground)]">
              {t("Find someone", "ابحث عن شخص")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t("Close", "إغلاق")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            {t("Search the family and show someone on the tree.", "ابحث في العائلة واعرض أي شخص على الشجرة.")}
          </DialogPrimitive.Description>

          <div className="px-4 pb-3 pt-3">
            <label className="flex h-11 items-center gap-2.5 rounded-full bg-[var(--input)] px-4 text-[var(--muted-foreground)] focus-within:bg-[var(--card)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
              <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="sr-only">{t("Search by name", "ابحث بالاسم")}</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search by name", "ابحث بالاسم")}
                autoComplete="off"
                enterKeyHint="search"
                className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {dir === null ? (
              <ul role="status" aria-label={t("Loading the family…", "جارٍ تحميل العائلة…")} className="space-y-1 px-2">
                {Array.from({ length: 7 }, (_, i) => (
                  <li key={i} className="flex items-center gap-3 py-2">
                    <span className="h-11 w-11 animate-pulse rounded-full bg-[var(--muted)]" />
                    <span className="h-4 w-40 animate-pulse rounded-full bg-[var(--muted)]" />
                  </li>
                ))}
              </ul>
            ) : list.length === 0 ? (
              <p role="status" className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
                {query.trim()
                  ? t(`No one called “${query.trim()}” yet.`, `لا يوجد أحد باسم «${query.trim()}» بعد.`)
                  : t("No one has been added to the tree yet.", "لم تتم إضافة أحد إلى الشجرة بعد.")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {list.map((p) => {
                  const years = lifeYears(p.birth_date, p.death_date, lang);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          focusPerson(p.id);
                        }}
                        className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        <PersonAvatar person={p} lang={lang} className="h-11 w-11" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-[var(--foreground)]">
                            {directoryName(p, lang)}
                          </span>
                          {years && <span className="block text-xs text-[var(--muted-foreground)]">{years}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
