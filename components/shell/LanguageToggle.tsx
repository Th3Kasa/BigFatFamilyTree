"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchLanguage } from "@/lib/lang/client";
import type { Lang } from "@/lib/lang/server";

/**
 * Visible EN / عربي switch. Shows the language you can switch TO, written in
 * that language, so it is findable by people who can't read the current one.
 */
export function LanguageToggle({ lang, className, compact = false }: { lang: Lang; className?: string; compact?: boolean }) {
  const next: Lang = lang === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      onClick={() => switchLanguage(next)}
      aria-label={lang === "ar" ? "Switch to English · التبديل إلى الإنجليزية" : "التبديل إلى العربية · Switch to Arabic"}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--card)] text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        compact ? "w-11 px-0" : "px-3.5",
        className,
      )}
    >
      {!compact && <Languages className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden />}
      <span lang={next} dir={next === "ar" ? "rtl" : "ltr"} className={next === "ar" ? "font-[family-name:var(--font-arabic)]" : undefined}>
        {next === "ar" ? "عربي" : "EN"}
      </span>
    </button>
  );
}
