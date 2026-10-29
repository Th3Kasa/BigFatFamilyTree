"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { searchPeople } from "@/lib/kinship/search";
import { personName, type Lang, type ViewPerson } from "@/lib/kinship/view";

type Props = {
  label: string;
  people: ViewPerson[];
  value: string | null;
  onChange: (id: string | null) => void;
  lang: Lang;
};

/** Rows drawn at once; the rest are reached by typing more of the name (the list says so). */
const MAX_OPTIONS = 100;

function initials(p: ViewPerson, lang: Lang) {
  const name = personName(p, lang, true);
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}

/**
 * Accessible person picker (ARIA 1.2 combobox with a listbox popup).
 * ↑/↓ move through results, Enter picks, Esc closes and restores the current
 * pick. The text box shows the chosen person until you start typing.
 */
export function PersonCombobox({ label, people, value, onChange, lang }: Props) {
  const uid = useId();
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = value ? people.find((p) => p.id === value) : undefined;
  const shown = editing ? query : selected ? personName(selected, lang, true) : "";

  const matches = useMemo(() => searchPeople(people, editing ? query : ""), [people, editing, query]);
  const options = matches.length > MAX_OPTIONS ? matches.slice(0, MAX_OPTIONS) : matches;
  const hidden = matches.length - options.length;
  const noMatches = open && options.length === 0;

  // Keep the highlighted option visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from the stable id
  }, [active, open]);

  function close() {
    setOpen(false);
    setEditing(false);
    setQuery("");
  }

  function pick(p: ViewPerson) {
    onChange(p.id);
    close();
  }

  function openList() {
    if (open) return;
    const at = options.findIndex((p) => p.id === value);
    setActive(at >= 0 ? at : 0);
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActive(Math.max(options.length - 1, 0));
        }
        break;
      case "Enter":
        if (open && options[active]) {
          e.preventDefault();
          pick(options[active]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  }

  const countText =
    lang === "ar" ? `تم العثور على ${matches.length}` : `${matches.length} ${matches.length === 1 ? "person" : "people"} found`;

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>

      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center">
          {selected && !editing ? (
            <Avatar className="h-7 w-7">
              {selected.photo_url && <AvatarImage src={selected.photo_url} alt="" className="object-cover" />}
              <AvatarFallback className="text-[10px] font-semibold">{initials(selected, lang)}</AvatarFallback>
            </Avatar>
          ) : (
            <Search className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden />
          )}
        </span>

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open && !noMatches ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && options.length > 0 ? optionId(active) : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={shown}
          placeholder={lang === "ar" ? "ابحث بالاسم…" : "Search by name…"}
          onChange={(e) => {
            setEditing(true);
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            e.currentTarget.select();
            openList();
          }}
          onBlur={close}
          onKeyDown={onKeyDown}
          className={cn(
            "h-11 min-h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card)] ps-12 text-sm text-[var(--foreground)]",
            selected ? "pe-12" : "pe-3",
            "placeholder:text-[var(--muted-foreground)]",
            "focus-visible:border-[var(--ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          )}
        />

        {selected && (
          <button
            type="button"
            // Keep focus in the input so blur doesn't close the list before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(null);
              close();
              inputRef.current?.focus();
            }}
            aria-label={lang === "ar" ? `مسح: ${label}` : `Clear: ${label}`}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {open ? countText : ""}
      </p>

      {open && (
        <div
          // Clicking the scrollbar or padding must not blur the input and close the list.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-deep)]"
        >
          {noMatches ? (
            <p className="px-4 py-4 text-sm text-[var(--muted-foreground)]">
              {lang === "ar" ? "لا أحد بهذا الاسم" : "No one matches that name"}
            </p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="scrollbar-thin max-h-64 overflow-y-auto py-1"
            >
              {options.map((p, i) => (
                <li
                  key={p.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={p.id === value}
                  // mousedown (not click) so the input keeps focus and blur doesn't swallow the pick.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(p);
                  }}
                  onMouseMove={() => active !== i && setActive(i)}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-1.5 text-sm",
                    i === active && "bg-[var(--muted)]",
                    p.id === value && "font-semibold",
                  )}
                >
                  <Avatar className="h-8 w-8">
                    {p.photo_url && <AvatarImage src={p.photo_url} alt="" className="object-cover" />}
                    <AvatarFallback className="text-[10px] font-semibold">{initials(p, lang)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{personName(p, lang, true)}</span>
                </li>
              ))}
              {hidden > 0 && (
                <li role="presentation" className="px-3 py-2.5 text-xs text-[var(--muted-foreground)]">
                  {lang === "ar"
                    ? `و${hidden} آخرون. اكتب المزيد من الاسم لتضييق النتائج.`
                    : `${hidden} more. Type more of the name to narrow the list.`}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
