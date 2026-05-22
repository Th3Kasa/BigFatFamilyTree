"use client";

import type React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, User as UserIcon, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Person = {
  id: string;
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  photo_url: string | null;
  gender?: "m" | "f" | "unknown" | null;
};

interface SearchBarProps {
  placeholder?: string;
  lang?: "ar" | "en";
}

const GooeyFilter = () => (
  <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
    <defs>
      <filter id="bft-gooey">
        <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8"
          result="goo"
        />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
    </defs>
  </svg>
);

function displayLabel(p: Person, lang: "ar" | "en") {
  const given =
    lang === "ar" ? p.given_ar ?? p.given_en : p.given_en ?? p.given_ar;
  const family =
    lang === "ar"
      ? p.family_name_ar ?? p.family_name_en
      : p.family_name_en ?? p.family_name_ar;
  return {
    given: given ?? (lang === "ar" ? "بدون اسم" : "Unnamed"),
    family: family ?? "",
  };
}

function searchHaystack(p: Person) {
  return [
    p.given_en,
    p.given_ar,
    p.family_name_en,
    p.family_name_ar,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function SearchBar({
  placeholder,
  lang = "en",
}: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(false);

  const isUnsupportedBrowser = useMemo(() => {
    if (typeof window === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    const isSafari =
      ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium");
    const isChromeOniOS = ua.includes("crios");
    return isSafari || isChromeOniOS;
  }, []);

  // Fetch people once when the user first focuses the search.
  // NOTE: do NOT include `loading` in deps — setting it to true would
  // remount the effect and cause its own cleanup to mark cancelled=true,
  // which would then prevent setLoading(false) from ever running.
  useEffect(() => {
    if (!isFocused || people !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("people")
          .select(
            "id, slug, given_en, given_ar, family_name_en, family_name_ar, photo_url, gender, is_placeholder",
          )
          .is("deleted_at", null)
          .order("given_en");
        if (cancelled) return;
        if (error) {
          // Treat as empty list so the dropdown can show "No matches"
          setPeople([]);
          return;
        }
        const real = (data ?? []).filter(
          (p) => !(p as { is_placeholder?: boolean }).is_placeholder,
        );
        setPeople(real as Person[]);
      } catch {
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, people]);

  // Filtered matches
  const matches = useMemo(() => {
    if (!people || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return people.filter((p) => searchHaystack(p).includes(q)).slice(0, 8);
  }, [people, query]);

  // Close on outside click
  useEffect(() => {
    if (!isFocused) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [isFocused]);

  function gotoPerson(p: Person) {
    setIsFocused(false);
    setQuery("");
    router.push(`/person/${p.slug ?? p.id}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (matches[0]) gotoPerson(matches[0]);
  }

  const placeholderText =
    placeholder ?? (lang === "ar" ? "ابحث عن شخص…" : "Search people…");

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <GooeyFilter />

      <motion.form
        onSubmit={handleSubmit}
        className="relative flex items-center justify-center w-full"
        initial={{ width: 240 }}
        animate={{ width: isFocused ? 380 : 240, scale: isFocused ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <motion.div
          className={cn(
            "relative flex w-full items-center overflow-hidden rounded-full border backdrop-blur-md transition-colors",
            isFocused
              ? "border-transparent shadow-[0_18px_44px_-12px_oklch(0.34_0.13_18_/_0.25)]"
              : "border-[var(--border)] bg-[var(--card)]/85",
          )}
          animate={{
            boxShadow: isFocused
              ? "0 18px 44px -12px oklch(0.34 0.13 18 / 0.30)"
              : "0 1px 2px oklch(0.18 0.04 15 / 0.06)",
          }}
        >
          {isFocused && (
            <motion.div
              className="absolute inset-0 -z-10"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 0.18,
                background: [
                  "linear-gradient(90deg, oklch(0.68 0.18 38) 0%, oklch(0.62 0.20 18) 100%)",
                  "linear-gradient(90deg, oklch(0.62 0.20 18) 0%, oklch(0.34 0.13 18) 100%)",
                  "linear-gradient(90deg, oklch(0.34 0.13 18) 0%, oklch(0.68 0.18 38) 100%)",
                  "linear-gradient(90deg, oklch(0.68 0.18 38) 0%, oklch(0.62 0.20 18) 100%)",
                ],
              }}
              transition={{
                duration: 14,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            />
          )}

          <motion.div
            className="pl-4 py-3"
            animate={{
              rotate: loading ? 360 : 0,
              scale: isFocused ? 1.1 : 1,
            }}
            transition={{
              rotate: { duration: 1.2, ease: "linear", repeat: loading ? Infinity : 0 },
              scale: { type: "spring", stiffness: 300, damping: 20 },
            }}
          >
            {loading ? (
              <Loader2 size={18} className="text-[var(--accent)]" />
            ) : (
              <Search
                size={18}
                strokeWidth={isFocused ? 2.5 : 2}
                className={cn(
                  "transition-colors",
                  isFocused
                    ? "text-[var(--primary)]"
                    : "text-[var(--muted-foreground)]",
                )}
              />
            )}
          </motion.div>

          <input
            ref={inputRef}
            type="text"
            placeholder={placeholderText}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            className={cn(
              "relative z-10 w-full bg-transparent py-2.5 outline-none placeholder:text-[var(--muted-foreground)] font-medium text-sm",
              isFocused ? "tracking-wide text-[var(--foreground)]" : "text-[var(--foreground)]",
            )}
          />

          <AnimatePresence>
            {query && matches.length > 0 && (
              <motion.button
                type="submit"
                initial={{ opacity: 0, scale: 0.8, x: -16 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -16 }}
                whileTap={{ scale: 0.95 }}
                className="mx-2 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white shadow"
              >
                {lang === "ar" ? "↵" : "Go"}
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.form>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {isFocused && (query.trim() || matches.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="glass-2 absolute left-1/2 z-50 mt-2 w-[380px] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--border)] shadow-[var(--shadow-deep)]"
          >
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-[var(--muted-foreground)]">
                {lang === "ar" ? "جاري التحميل…" : "Loading…"}
              </div>
            ) : matches.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[var(--muted-foreground)]">
                {query.trim()
                  ? lang === "ar"
                    ? "لا توجد نتائج"
                    : "No matches"
                  : lang === "ar"
                    ? "اكتب اسماً للبحث"
                    : "Type a name to search"}
              </div>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-[var(--border)] overflow-y-auto">
                {matches.map((p, index) => {
                  const { given, family } = displayLabel(p, lang);
                  return (
                    <motion.li
                      key={p.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => gotoPerson(p)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--muted)]/55"
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-offset-1 ring-offset-[var(--card)]",
                            p.gender === "f"
                              ? "ring-rose-200"
                              : p.gender === "m"
                                ? "ring-[oklch(0.86_0.07_38)]/70"
                                : "ring-[var(--border)]",
                          )}
                        >
                          {p.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.photo_url}
                              alt={given}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <UserIcon className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span
                            className="truncate text-sm font-medium text-[var(--foreground)]"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {given}
                          </span>
                          {family && (
                            <span className="truncate text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                              {family}
                            </span>
                          )}
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
