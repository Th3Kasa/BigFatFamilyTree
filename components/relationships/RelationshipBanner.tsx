"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Route, X } from "lucide-react";

type Props = {
  lang: "ar" | "en";
  /** Plain-language answer in both languages, e.g. "Tarek is Omar's first cousin". */
  answer: { en: string; ar: string };
  /** Link to the full finder with the same pair; omitted for signed-out visitors. */
  finderHref?: string;
};

/**
 * Floating answer shown over the home canvas when it is opened with
 * `?from=&to=`. "Clear" drops the query and with it the highlight.
 */
export function RelationshipBanner({ lang, answer, finderHref }: Props) {
  const router = useRouter();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const primary = lang === "ar" ? answer.ar : answer.en;

  return (
    // Centred with flex (not translate) so it behaves in RTL; leaves room at the end for the "focus on the path" button.
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center ps-3 pe-[68px] sm:ps-4">
      <div
        role="status"
        aria-live="polite"
        className="glass-2 pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[var(--border)] py-2 ps-4 pe-2 shadow-[var(--shadow-floating)]"
      >
        <Route className="h-5 w-5 shrink-0 text-[var(--path)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]" title={primary}>
            {primary}
          </p>
          {finderHref && (
            <Link
              href={finderHref}
              className="text-xs font-medium text-[var(--path)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {t("See the steps", "شاهد الخطوات")}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="h-4 w-4" aria-hidden />
          {t("Clear", "مسح")}
        </button>
      </div>
    </div>
  );
}
