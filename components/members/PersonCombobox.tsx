"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn, getDisplayName } from "@/lib/utils";
import { formatPersonSubline, rankCandidates } from "@/lib/members/match";
import type { PersonSummary } from "@/lib/members/types";
import { fieldClass, Initials } from "./primitives";

type Props = {
  people: PersonSummary[];
  lang: "ar" | "en";
  label: string;
  placeholder?: string;
  value: PersonSummary | null;
  onChange: (person: PersonSummary | null) => void;
  /** Hide people who can't be chosen (e.g. only men for "father"). */
  filter?: (p: PersonSummary) => boolean;
  excludeIds?: string[];
  autoFocus?: boolean;
  /** Form field name; renders a hidden input carrying the chosen person id. */
  name?: string;
  hint?: string;
  error?: string;
};

const MAX_OPTIONS = 8;

/**
 * Accessible person search (ARIA 1.2 combobox with a listbox popup).
 * Type to filter, Arrow keys to move, Enter to choose, Escape to close.
 * The list is rendered in the normal flow so it works inside dialogs.
 */
export function PersonCombobox({
  people,
  lang,
  label,
  placeholder,
  value,
  onChange,
  filter,
  excludeIds,
  autoFocus,
  name,
  hint,
  error,
}: Props) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState(value ? getDisplayName(value, lang) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const pool = useMemo(() => {
    const skip = new Set(excludeIds ?? []);
    return people.filter((p) => !skip.has(p.id) && (!filter || filter(p)));
  }, [people, filter, excludeIds]);

  const options = useMemo(() => {
    const q = text.trim();
    if (value && q === getDisplayName(value, lang)) return [];
    if (!q) {
      return [...pool]
        .sort((a, b) => getDisplayName(a, lang).localeCompare(getDisplayName(b, lang)))
        .slice(0, MAX_OPTIONS);
    }
    return rankCandidates(pool, { query: q }).slice(0, MAX_OPTIONS);
  }, [pool, text, value, lang]);

  const showList = open && options.length > 0;
  const showEmpty = open && options.length === 0 && text.trim().length > 0 && !(value && text === getDisplayName(value, lang));

  function choose(p: PersonSummary) {
    onChange(p);
    setText(getDisplayName(p, lang));
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setText("");
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home" && showList) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && showList) {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" && showList) {
      e.preventDefault();
      const p = options[active];
      if (p) choose(p);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation(); // keep a surrounding dialog open
      setOpen(false);
    }
  }

  const activeId = showList ? `${uid}-opt-${active}` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-[#241517]">
        {label}
      </label>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-[var(--muted-foreground)]"
        />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            if (value) onChange(null);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={cn(fieldClass, "ps-11", value && "pe-12")}
        />
        {value || text ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            aria-label={t("Clear", "مسح")}
            className="absolute end-1.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-white hover:text-[#241517] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        {name ? <input type="hidden" name={name} value={value?.id ?? ""} /> : null}
      </div>

      {hint ? (
        <p id={hintId} className="text-xs text-[var(--muted-foreground)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!showList}
        className="max-h-64 overflow-y-auto rounded-2xl border border-[#ECE2DE] bg-white p-1 shadow-sm"
      >
        {options.map((p, i) => {
          const full = getDisplayName(p, lang);
          return (
            <li
              key={p.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the input's blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2",
                i === active && "bg-[#F7E7EB]",
              )}
            >
              <Initials name={full} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[#241517]">{full}</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">
                  {formatPersonSubline(p, lang) || t("No details yet", "لا توجد تفاصيل بعد")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {showEmpty ? (
        <p className="px-1 text-sm text-[var(--muted-foreground)]">
          {t("No one in the tree matches that.", "لا أحد في الشجرة يطابق ذلك.")}
        </p>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {open && text.trim()
          ? options.length > 0
            ? t(`${options.length} people match`, `${options.length} نتائج مطابقة`)
            : t("No matches", "لا توجد نتائج")
          : ""}
      </span>
    </div>
  );
}
