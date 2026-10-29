"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { dismissProfileChecklist } from "@/lib/actions/members";
import { progressLabel, type ChecklistData } from "@/lib/members/checklist";
import { cn } from "@/lib/utils";
import { cardClass, displayFont, pill } from "./primitives";

type Props = {
  lang: "ar" | "en";
  /** From loadProfileChecklist() in lib/members/checklist-data.ts (null = render nothing, so pass it straight through). */
  checklist: ChecklistData | null;
  className?: string;
};

/**
 * "Finish your profile": five small things with "3 of 5 done" progress. The
 * close button hides it for good (profiles.checklist_dismissed_at).
 */
export function ProfileChecklist({ lang, checklist, className }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!checklist || hidden) return null;
  const { items, done, total } = checklist;

  function dismiss() {
    startTransition(async () => {
      try {
        const res = await dismissProfileChecklist();
        if (res.ok) setHidden(true);
        else toast.error(res.error);
      } catch {
        toast.error(t("Couldn't hide that. Please try again.", "تعذّر الإخفاء. حاول مرة أخرى."));
      }
    });
  }

  return (
    <section aria-labelledby="checklist-h" className={cn(cardClass, "relative p-4", className)}>
      <button
        type="button"
        onClick={dismiss}
        disabled={pending}
        aria-label={t("Hide this checklist", "إخفاء هذه القائمة")}
        className="absolute end-2 top-2 flex size-11 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[#F4EDEA] hover:text-[#241517] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50"
      >
        <X aria-hidden="true" className="size-5" />
      </button>

      <h2 id="checklist-h" className="pe-10 text-lg font-bold" style={displayFont(lang)}>
        {t("Finish your profile", "أكمل ملفك الشخصي")}
      </h2>
      <p className="mt-0.5 text-sm font-semibold text-[var(--primary)]" aria-live="polite">
        {progressLabel(done, total, lang)}
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={progressLabel(done, total, lang)}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E2D6D2]"
      >
        <div className="h-full rounded-full bg-[var(--primary)] transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <ul className="mt-3 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 rounded-2xl px-1 py-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                item.done ? "border-[#2F5A27] bg-[#E3EEDF] text-[#2F5A27]" : "border-[#C9B8B3] text-transparent",
              )}
            >
              <Check className="size-4" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-[15px] font-semibold", item.done && "text-[var(--muted-foreground)] line-through")}>
                {t(item.title.en, item.title.ar)}
                <span className="sr-only">{item.done ? t(" (done)", " (تم)") : t(" (to do)", " (للإنجاز)")}</span>
              </span>
              {!item.done ? (
                <span className="block text-[13px] text-[var(--muted-foreground)]">{t(item.hint.en, item.hint.ar)}</span>
              ) : null}
            </span>
            {item.href && item.action ? (
              <Link href={item.href} className={pill.outline}>
                {t(item.action.en, item.action.ar)}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
