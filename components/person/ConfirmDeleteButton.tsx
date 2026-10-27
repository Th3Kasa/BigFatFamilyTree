"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon button that submits a server action after a native confirm. */
export function ConfirmDeleteButton({
  action,
  label,
  confirmText,
  className,
}: {
  action: () => Promise<void>;
  /** Accessible name, e.g. "Delete this memory". */
  label: string;
  confirmText: string;
  className?: string;
}) {
  return (
    <form action={action}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        onClick={(e) => {
          if (!confirm(confirmText)) e.preventDefault();
        }}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          className,
        )}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}
