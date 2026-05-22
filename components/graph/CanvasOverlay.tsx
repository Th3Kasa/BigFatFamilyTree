"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, MousePointer2, Heart, UserPlus, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const HINT_KEY = "bft.canvas.hint.dismissed";

type Props = {
  lang: "ar" | "en";
};

export function CanvasOverlay({ lang }: Props) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const dismissed = localStorage.getItem(HINT_KEY);
      if (!dismissed) setShowHint(true);
    } catch {
      // localStorage blocked — show once per session
      setShowHint(true);
    }
  }, []);

  function dismissHint() {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, String(Date.now()));
    } catch {}
  }

  return (
    <>
      {/* First-time hint banner */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0.32, 1] }}
            className="absolute left-1/2 top-4 z-30 -translate-x-1/2"
          >
            <div className="glass-2 flex items-start gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 shadow-[var(--shadow-floating)]">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
              <div className="text-xs leading-relaxed text-[var(--foreground)] max-w-[24rem]">
                <strong className="font-semibold">
                  {lang === "ar" ? "ابدأ شجرتك" : "Welcome to your family canvas"}
                </strong>
                <div className="mt-1 text-[var(--muted-foreground)]">
                  {lang === "ar" ? (
                    <>
                      اسحب نقطة من أي بطاقة إلى بطاقة أخرى لإنشاء علاقة.
                      انقر على شخص لرؤية لوحة العائلة والأبناء والإخوة.
                    </>
                  ) : (
                    <>
                      Drag from any tile&apos;s handle to another tile to create a
                      relationship. Click a person to open the family panel with
                      marriages, children &amp; siblings.
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={dismissHint}
                aria-label={lang === "ar" ? "إغلاق" : "Dismiss"}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom-center legend — informational only, not clickable */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 md:block">
        <div className="glass-2 flex items-center gap-3 rounded-full border border-[var(--border)] px-3.5 py-1.5 shadow-[var(--shadow-floating)] text-[10px] text-[var(--muted-foreground)]">
          <span
            aria-hidden
            className="font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]/70"
            title={lang === "ar" ? "مفتاح الخطوط" : "Line legend"}
          >
            {lang === "ar" ? "المفتاح" : "Legend"}
          </span>
          <Sep />
          <LegendItem
            color="oklch(0.62 0.20 18)"
            label={lang === "ar" ? "زواج" : "Marriage"}
          />
          <LegendItem
            color="oklch(0.62 0.20 18 / 0.55)"
            label={lang === "ar" ? "طلاق" : "Divorced"}
            dashed
          />
          <LegendItem
            color="oklch(0.62 0.20 18 / 0.70)"
            label={lang === "ar" ? "نسب" : "Parent-child"}
          />
          <LegendItem
            color="oklch(0.52 0.18 280 / 0.65)"
            label={lang === "ar" ? "تبني" : "Adoptive"}
            dashed
          />
          <LegendItem
            color="oklch(0.52 0.14 150 / 0.65)"
            label={lang === "ar" ? "ولي أمر" : "Guardian"}
            dashed
          />
        </div>
      </div>

      {/* Bottom-right floating Add Person FAB */}
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/person/new"
              className={cn(
                "absolute bottom-6 right-6 z-20",
                "flex h-14 w-14 items-center justify-center rounded-full",
                "bg-[var(--primary)] text-[var(--primary-foreground)]",
                "shadow-[0_8px_24px_-4px_oklch(0.34_0.13_18_/_0.45),0_0_0_1px_oklch(0.34_0.13_18_/_0.20)]",
                "transition-[transform,box-shadow] duration-200",
                "hover:-translate-y-[2px] hover:shadow-[0_12px_32px_-4px_oklch(0.34_0.13_18_/_0.55),0_0_0_1px_oklch(0.34_0.13_18_/_0.30)]",
              )}
              aria-label={lang === "ar" ? "إضافة شخص" : "Add person"}
            >
              <Plus className="h-6 w-6" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="left">
            {lang === "ar" ? "إضافة شخص" : "Add person"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}

function Sep() {
  return <span aria-hidden className="h-3 w-px bg-[var(--border)]" />;
}

function LegendItem({
  color,
  label,
  icon: Icon,
  dashed,
}: {
  color: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon ? (
        <Icon className="h-3 w-3" style={{ color }} />
      ) : (
        <span
          aria-hidden
          className="inline-block h-3 w-5"
          style={{
            borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
          }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}

// Convenient re-export of useless reference to satisfy build picking up Users icon
// (so future code can reference siblings legend easily without re-import)
export { Users as _CanvasOverlay_Users };
