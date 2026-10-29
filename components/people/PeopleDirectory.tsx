"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn, getDisplayName } from "@/lib/utils";
import { lifeYears } from "@/lib/people/display";
import { personHaystack, type DirectoryPerson } from "@/lib/client/family-directory";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { Lang } from "@/lib/lang/server";

type Props = {
  people: DirectoryPerson[];
  lang: Lang;
  /** "az" groups by first letter; "recent" keeps the server's newest-first order. */
  sort: "az" | "recent";
};

function firstLetter(name: string, lang: Lang) {
  const ch = Array.from(name.trim())[0] ?? "#";
  return /\p{L}/u.test(ch) ? ch.toLocaleUpperCase(lang) : "#";
}

/** Searchable grid of person cards; filtering is instant and client-side. */
export function PeopleDirectory({ people, lang, sort }: Props) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const filtered = useMemo(() => {
    const q = deferred.trim().toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
    return q ? people.filter((p) => personHaystack(p).includes(q)) : people;
  }, [people, deferred]);

  const groups = useMemo(() => {
    if (sort === "recent") return [{ key: "all", label: null as string | null, people: filtered }];
    const map = new Map<string, DirectoryPerson[]>();
    for (const p of filtered) {
      const letter = firstLetter(getDisplayName(p, lang), lang);
      const list = map.get(letter) ?? [];
      list.push(p);
      map.set(letter, list);
    }
    return [...map.entries()].map(([key, list]) => ({ key, label: key, people: list }));
  }, [filtered, sort, lang]);

  return (
    <div className="flex flex-col gap-5">
      <label className="flex h-12 w-full max-w-xl items-center gap-2.5 rounded-full border border-transparent bg-[var(--card)] px-4 text-[var(--muted-foreground)] shadow-[var(--shadow-floating)] focus-within:border-[var(--primary)]">
        <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className="sr-only">{t("Search people by name", "ابحث عن الأشخاص بالاسم")}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search by name", "ابحث بالاسم")}
          autoComplete="off"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
        />
      </label>

      <p className="sr-only" role="status" aria-live="polite">
        {query.trim()
          ? t(`${filtered.length} matching`, `${filtered.length} نتيجة`)
          : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[var(--border-strong)] bg-[var(--card)] px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-[var(--foreground)]">
            {t(`No one called “${query.trim()}”`, `لا يوجد أحد باسم «${query.trim()}»`)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {t("Try a first name, or the name in Arabic or English.", "جرّب الاسم الأول، أو الاسم بالعربية أو الإنجليزية.")}
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={g.label ? `letter-${g.key}` : undefined}>
            {g.label && (
              <h2 id={`letter-${g.key}`} className="font-heading mb-2.5 text-lg font-bold text-[var(--foreground)]">
                {g.label}
              </h2>
            )}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {g.people.map((p) => {
                const years = lifeYears(p.birth_date, p.death_date, lang);
                return (
                  <li key={p.id}>
                    <Link
                      href={`/person/${encodeURIComponent(p.slug ?? p.id)}`}
                      className={cn(
                        "flex h-full flex-col items-center gap-2 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-3 py-5 text-center transition-shadow",
                        "hover:shadow-[var(--shadow-floating)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      )}
                    >
                      <PersonAvatar person={p} lang={lang} className="h-16 w-16" textClassName="text-lg" />
                      <span className="w-full truncate text-[15px] font-semibold text-[var(--foreground)]">
                        {getDisplayName(p, lang)}
                      </span>
                      <span className="-mt-1.5 h-4 text-xs text-[var(--muted-foreground)]">{years}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
