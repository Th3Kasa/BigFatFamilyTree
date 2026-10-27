"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

const noopSubscribe = () => () => {};

/** The root layout sets <html lang>; read it so this client page matches. */
function useDocumentLang(): "ar" | "en" {
  return useSyncExternalStore(
    noopSubscribe,
    () => (document.documentElement.lang === "ar" ? "ar" : "en"),
    () => "en",
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = useDocumentLang();
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100svh-var(--topbar-h)-var(--tabbar-h))] items-center justify-center p-4">
      <section
        role="alert"
        aria-labelledby="error-title"
        className="w-full max-w-md rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-[var(--shadow-floating)]"
      >
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <TriangleAlert className="h-7 w-7" aria-hidden />
        </span>
        <h1 id="error-title" className="font-heading text-2xl font-bold text-[var(--foreground)]">
          {t("Something went wrong", "حدث خطأ ما")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
          {t(
            "This page didn't load properly. Your family's information is safe. Try again, and if it keeps happening, tell an admin.",
            "لم تُحمَّل هذه الصفحة كما يجب. معلومات عائلتك بأمان. حاول مرة أخرى، وإن تكرّر ذلك فأخبر أحد المشرفين.",
          )}
        </p>

        {error.digest && (
          <p className="mt-4 text-xs text-[var(--muted-foreground)]">
            {t("Reference for an admin: ", "رمز للمشرف: ")}
            <code dir="ltr" className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[var(--foreground)]">
              {error.digest}
            </code>
          </p>
        )}

        {/* Details only while developing; production never shows messages or stack traces. */}
        {isDev && error.message && (
          <pre
            dir="ltr"
            className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[var(--muted)] p-3 text-start text-xs leading-relaxed text-[var(--foreground)]"
          >
            {error.message}
          </pre>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t("Try again", "حاول مرة أخرى")}
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            {t("Back to the family tree", "العودة إلى شجرة العائلة")}
          </Link>
        </div>
      </section>
    </div>
  );
}
