"use client";

import { Plus } from "lucide-react";
import { shell, useShell } from "@/lib/client/shell-store";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/lang/server";

/** Primary "+ Add" pill in the top bar; opens the unified Add menu. */
export function AddButton({ lang, className }: { lang: Lang; className?: string }) {
  const open = useShell((s) => s.addOpen);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => shell.openAdd()}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary)] px-[18px] text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        className,
      )}
    >
      <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
      {lang === "ar" ? "إضافة" : "Add"}
    </button>
  );
}
