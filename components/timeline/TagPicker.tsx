"use client";

import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { searchPeople } from "@/lib/kinship/search";
import type { TimelinePerson } from "./Timeline";

/** Pick people to tag: type a name, choose from the matches. */
export function TagPicker({
  people,
  value,
  onChange,
  lang,
  excludeId,
}: {
  people: TimelinePerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  lang: "ar" | "en";
  excludeId: string;
}) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const id = useId();
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const matches = useMemo(
    () => (query.trim() ? searchPeople(people.filter((p) => p.id !== excludeId && !value.includes(p.id)), query, 6) : []),
    [people, query, value, excludeId],
  );

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-[var(--foreground)]">
        {t("Who's in it?", "من يظهر فيها؟")}
      </label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((pid) => (
            <li key={pid} className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] py-1 pe-1 ps-3 text-[13px] font-semibold text-[var(--primary)]">
              {byId.get(pid)?.name ?? "?"}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== pid))}
                aria-label={t(`Remove ${byId.get(pid)?.name ?? ""}`, `إزالة ${byId.get(pid)?.name ?? ""}`)}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("Type a name to tag someone", "اكتب اسمًا لوسم شخص")}
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card)] px-3 text-[15px] focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      {matches.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...value, p.id]);
                  setQuery("");
                }}
                className="flex min-h-11 w-full items-center px-3 text-start text-[15px] hover:bg-[var(--muted)] focus-visible:bg-[var(--muted)] focus-visible:outline-none"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
