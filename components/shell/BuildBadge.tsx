"use client";

import { useState } from "react";

const SHA =
  (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA as string | undefined) ??
  (process.env.NEXT_PUBLIC_BUILD_SHA as string | undefined) ??
  "local";

const SHORT = SHA.slice(0, 7);

export function BuildBadge() {
  const [open, setOpen] = useState(false);
  if (!SHORT) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="fixed bottom-2 left-2 z-50 rounded-full border border-[var(--border)] bg-[var(--card)]/85 px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--muted-foreground)] shadow-sm backdrop-blur transition-colors hover:bg-[var(--card)] hover:text-[var(--foreground)]"
      aria-label={`Build ${SHORT}`}
      title="Click for build info"
    >
      v{SHORT}
      {open && (
        <span className="ml-1 hidden sm:inline-block max-w-[60ch] truncate text-[var(--muted-foreground)]">
          {SHA}
        </span>
      )}
    </button>
  );
}
