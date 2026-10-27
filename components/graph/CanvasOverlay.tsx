"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EDGE_STYLES, GHOST_OPACITY, WIDOWED_GLYPH } from "@/lib/graph/edge-styles";

const HINT_KEY = "bft.canvas.hint.dismissed";

type Props = {
  lang: "ar" | "en";
  /** Read-only view: hide the editing hint. The legend stays. */
  readOnly?: boolean;
  /** A relationship path is highlighted: add it to the legend. */
  pathLegend?: boolean;
};

// The hint's "dismissed" flag lives in localStorage; read it without an effect.
const noopSubscribe = () => () => {};
function readHintDismissed() {
  try {
    return localStorage.getItem(HINT_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Canvas chrome that isn't a control: the first-visit tip and the line legend
 * (two common line types, with every type one tap away in a popover).
 */
export function CanvasOverlay({ lang, readOnly = false, pathLegend = false }: Props) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const storedDismissed = useSyncExternalStore(noopSubscribe, readHintDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  const showHint = !readOnly && !storedDismissed && !dismissed;

  function dismissHint() {
    setDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, String(Date.now()));
    } catch {
      // Storage blocked: the tip simply returns next visit.
    }
  }

  return (
    <>
      {showHint && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center pe-16 ps-3 md:top-4 md:pe-20">
          <div
            role="note"
            className="pointer-events-auto flex max-w-md items-start gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] py-3 pe-2 ps-4 shadow-[var(--shadow-floating)]"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
            <p className="text-sm leading-relaxed text-[var(--foreground)]">
              <strong className="font-semibold">{t("Tip: ", "نصيحة: ")}</strong>
              {t(
                "Click anyone to see their family. Drag a dot from one card to another to connect two people.",
                "انقر على أي شخص لترى عائلته. اسحب نقطة من بطاقة إلى أخرى لربط شخصين.",
              )}
            </p>
            <button
              type="button"
              onClick={dismissHint}
              aria-label={t("Dismiss tip", "إخفاء النصيحة")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <Legend lang={lang} pathLegend={pathLegend} />
    </>
  );
}

function Legend({ lang, pathLegend }: { lang: "ar" | "en"; pathLegend: boolean }) {
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute bottom-3 start-3 z-20 md:bottom-4 md:start-4">
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={t("All line types", "كل أنواع الخطوط")}
          className="absolute bottom-full start-0 mb-2 w-64 rounded-[20px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-deep)]"
        >
          <p className="mb-3 text-sm font-semibold text-[var(--foreground)]">{t("What the lines mean", "معنى الخطوط")}</p>
          <ul className="flex flex-col gap-2.5 text-sm text-[var(--foreground)]">
            {pathLegend && <LegendItem color="var(--path)" label={t("How you're related", "مسار القرابة")} thick />}
            <LegendItem color={EDGE_STYLES.parentChild.stroke} label={t("Parent and child", "والد وطفل")} />
            <LegendItem color={EDGE_STYLES.coupleCurrent.stroke} label={t("Married", "متزوجان")} />
            <LegendItem color={EDGE_STYLES.coupleWidowed.stroke} label={t("Widowed", "ترمّل")} dash glyph={WIDOWED_GLYPH} />
            <LegendItem color={EDGE_STYLES.coupleDivorced.stroke} label={t("Divorced", "طلاق")} dash />
            <LegendItem color={EDGE_STYLES.coupleDivorced.stroke} label={t("Earlier marriage", "زواج سابق")} dash ghost />
            <LegendItem color={EDGE_STYLES.adopted.stroke} label={t("Adopted", "تبنٍّ")} dash />
            <LegendItem color={EDGE_STYLES.guardian.stroke} label={t("Raised by (guardian)", "ولي الأمر")} dash />
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--background)] py-1 pe-1 ps-3.5 text-xs text-[var(--muted-foreground)] shadow-[var(--shadow-floating)]">
        <span className="hidden items-center gap-1.5 sm:flex">
          <Swatch color={EDGE_STYLES.parentChild.stroke} />
          {t("Parent and child", "والد وطفل")}
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Swatch color={EDGE_STYLES.coupleCurrent.stroke} />
          {t("Married", "متزوجان")}
        </span>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {t("All line types", "كل أنواع الخطوط")}
        </button>
      </div>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-[3px] w-[18px] rounded-full" style={{ background: color }} />;
}

function LegendItem({
  color,
  label,
  dash,
  glyph,
  ghost,
  thick,
}: {
  color: string;
  label: string;
  dash?: boolean;
  glyph?: string;
  ghost?: boolean;
  thick?: boolean;
}) {
  return (
    <li className="flex items-center gap-3">
      <span aria-hidden className="relative inline-flex h-4 w-8 shrink-0 items-center" style={{ opacity: ghost ? GHOST_OPACITY : 1 }}>
        <span
          className={cn("inline-block w-8")}
          style={{ borderTop: `${thick ? 4 : 2}px ${dash ? "dashed" : "solid"} ${color}` }}
        />
        {glyph ? (
          <span className="absolute inset-x-0 -top-1 text-center text-[11px] font-semibold leading-none" style={{ color }}>
            {glyph}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </li>
  );
}
