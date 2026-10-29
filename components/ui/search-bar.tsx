"use client";

import type React from "react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  directoryName,
  matchPeople,
  matchStories,
  useFamilyDirectory,
  type DirectoryPerson,
  type StoryMatch,
} from "@/lib/client/family-directory";
import { useFocusPerson } from "@/lib/client/use-focus-person";
import { lifeYears } from "@/lib/people/display";
import { PersonAvatar } from "@/components/people/PersonAvatar";

interface SearchBarProps {
  lang?: "ar" | "en";
  className?: string;
}

type Option =
  | { kind: "person"; id: string; person: DirectoryPerson }
  | { kind: "story"; id: string; match: StoryMatch };

const noopSubscribe = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/**
 * The big pill search in the top bar. People first, then places and stories.
 * Picking a person pans the tree to them (or opens the tree focused on them);
 * picking a story or place opens that person's profile.
 * Keyboard: Ctrl/⌘ K focuses it, ↑/↓ moves, Enter picks, Esc closes.
 */
export function SearchBar({ lang = "en", className }: SearchBarProps) {
  const router = useRouter();
  const focusPerson = useFocusPerson();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const dir = useFamilyDirectory(touched);
  const isMac = useIsMac();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const options = useMemo<Option[]>(() => {
    if (!dir || !query.trim()) return [];
    const people = matchPeople(dir.people, query, 6).map<Option>((p) => ({ kind: "person", id: p.id, person: p }));
    const stories = matchStories(dir, query, lang, 4).map<Option>((m) => ({ kind: "story", id: m.story.id, match: m }));
    return [...people, ...stories];
  }, [dir, query, lang]);

  const firstStory = options.findIndex((o) => o.kind === "story");
  const activeIndex = options.length ? Math.min(active, options.length - 1) : -1;

  // Ctrl/⌘ K focuses this field while it is on screen. Runs in the capture
  // phase so the command palette's own shortcut doesn't also fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      const input = inputRef.current;
      if (!input || input.offsetParent === null) return;
      e.preventDefault();
      e.stopPropagation();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(option: Option) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (option.kind === "person") {
      focusPerson(option.person.id);
    } else {
      const p = option.match.person;
      router.push(`/person/${p.slug ?? p.id}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((i) => (Math.min(i, options.length - 1) + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((i) => (Math.min(i, options.length - 1) - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && open) {
        e.preventDefault();
        choose(options[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        setQuery("");
      }
    }
  }

  const showPanel = open && query.trim().length > 0;
  const loading = touched && dir === null;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-[560px]", className)}>
      <label
        className={cn(
          "flex h-11 w-full items-center gap-2.5 rounded-full border border-transparent bg-[var(--input)] px-4 text-[var(--muted-foreground)] transition-colors",
          "hover:border-[var(--border-strong)] focus-within:border-[var(--primary)] focus-within:bg-[var(--card)]",
        )}
      >
        {loading ? (
          <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" aria-hidden />
        ) : (
          <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
        )}
        <span className="sr-only">{t("Search the family", "ابحث في العائلة")}</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={t("Search people, places or stories", "ابحث عن أشخاص أو أماكن أو قصص")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setTouched(true);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd
          aria-hidden
          className="hidden shrink-0 rounded-md border border-[var(--border-strong)] bg-[var(--card)] px-1.5 py-0.5 font-sans text-xs text-[var(--muted-foreground)] lg:inline-block"
        >
          {isMac ? "⌘ K" : "Ctrl K"}
        </kbd>
      </label>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-deep)]">
          {loading ? (
            <p role="status" className="px-4 py-5 text-center text-sm text-[var(--muted-foreground)]">
              {t("Loading the family…", "جارٍ تحميل العائلة…")}
            </p>
          ) : options.length === 0 ? (
            <p role="status" className="px-4 py-5 text-center text-sm text-[var(--muted-foreground)]">
              {t(`No one or nothing matches “${query.trim()}”`, `لا توجد نتائج لـ «${query.trim()}»`)}
            </p>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            aria-label={t("Search results", "نتائج البحث")}
            className={cn("max-h-[60vh] overflow-y-auto p-1.5", options.length === 0 && "hidden")}
          >
            {options.map((o, i) => (
              <SearchOption
                key={`${o.kind}-${o.id}`}
                option={o}
                id={optionId(i)}
                active={i === activeIndex}
                lang={lang}
                heading={
                  i === 0 && o.kind === "person"
                    ? t("People", "الأشخاص")
                    : i === firstStory
                      ? t("Places and stories", "أماكن وقصص")
                      : null
                }
                onHover={() => setActive(i)}
                onChoose={() => choose(o)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SearchOption({
  option,
  id,
  active,
  lang,
  heading,
  onHover,
  onChoose,
}: {
  option: Option;
  id: string;
  active: boolean;
  lang: "ar" | "en";
  heading: string | null;
  onHover: () => void;
  onChoose: () => void;
}) {
  const person = option.kind === "person" ? option.person : option.match.person;
  const name = directoryName(person, lang);
  const years = lifeYears(person.birth_date, person.death_date, lang);

  return (
    <>
      {heading && (
        <li role="presentation" className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
          {heading}
        </li>
      )}
      <li
        id={id}
        role="option"
        aria-selected={active}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={onHover}
        onClick={onChoose}
        className={cn(
          "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2",
          active ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--muted)]",
        )}
      >
        {option.kind === "person" ? (
          <PersonAvatar person={person} lang={lang} className="h-9 w-9" textClassName="text-xs" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)]">
            {option.match.kind === "place" ? <MapPin className="h-4 w-4" aria-hidden /> : <BookOpen className="h-4 w-4" aria-hidden />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
            {option.kind === "person" ? name : option.match.snippet}
          </span>
          <span className="block truncate text-xs text-[var(--muted-foreground)]">
            {option.kind === "person"
              ? years || (lang === "ar" ? "اعرض على الشجرة" : "Show on the tree")
              : option.match.kind === "place"
                ? lang === "ar" ? `مكان في حياة ${name}` : `A place in ${name}'s life`
                : lang === "ar" ? `قصة عن ${name}` : `A story about ${name}`}
          </span>
        </span>
      </li>
    </>
  );
}
