"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--background)] px-6 py-12">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card,white)] p-6 shadow-sm">
        <header>
          <h1 className="text-lg font-semibold text-[var(--foreground)]">
            Something went wrong on this page
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            We caught the error so you can report it back.
          </p>
        </header>

        <pre className="max-h-64 overflow-auto rounded-md bg-[var(--muted)] p-3 text-xs leading-relaxed text-[var(--foreground)] whitespace-pre-wrap break-words">
          {error.message || "Unknown error"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
