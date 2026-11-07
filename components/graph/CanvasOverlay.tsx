"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VineArtPaths } from "./VineArtPaths";
import { EDGE_STYLES, GHOST_OPACITY, WIDOWED_GLYPH } from "@/lib/graph/edge-styles";
import { BARK, LEAF_TONES, coupleVine } from "@/lib/graph/vines";

const HINT_KEY = "bft.canvas.hint.v2.dismissed";

type Props = {
  lang: "ar" | "en";
  /** Read-only view: hide the editing hint. The legend stays. */
  readOnly?: boolean;
  /** Editors and admins: the tip mentions the "+ Add" placeholders. */
  canEdit?: boolean;
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
export function CanvasOverlay({ lang, readOnly = false, canEdit = false, pathLegend = false }: Props) {
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
        <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-3 md:top-[4.5rem] md:pe-20">
          <div
            role="note"
            className="pointer-events-auto flex max-w-md items-start gap-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] py-3 pe-2 ps-4 shadow-[var(--shadow-floating)]"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
            <p className="text-sm leading-relaxed text-[var(--foreground)]">
              <strong className="font-semibold">{t("Tip: ", "نصيحة: ")}</strong>
              {canEdit
                ? t(
                    "Click anyone to see their family. The dashed boxes show who's missing: click one to add them.",
                    "انقر على أي شخص لترى عائلته. المربعات المنقّطة تُظهر من ينقص: انقر على أحدها لإضافته.",
                  )
                : t("Click anyone to see their family.", "انقر على أي شخص لترى عائلته.")}
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
            <li className="flex items-center gap-3">
              <VineSwatch />
              <span>{t("Parent and child", "والد وطفل")}</span>
            </li>
            <li className="flex items-center gap-3">
              <VineSwatch twined />
              <span>{t("Married", "متزوجان")}</span>
            </li>
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
          <VineSwatch />
          {t("Parent and child", "والد وطفل")}
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <VineSwatch twined />
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

/** A tiny real vine for the legend: a wandering stem, or two strands when `twined`. */
function VineSwatch({ twined = false }: { twined?: boolean }) {
  const vine = coupleVine({ x: 0, y: 0, width: 0, height: 16 }, { x: 34, y: 0, width: 0, height: 16 }, 0, twined ? "legend-married" : "legend-family", twined);
  const leaf = "M 12 8 C 13 3 18 1 22 1 C 22 5 18 8 12 8 Z";
  return (
    <svg aria-hidden width="32" height="15" viewBox="0 0 34 16" className="shrink-0">
      <path d={leaf} fill={LEAF_TONES[0]} />
      {twined ? (
        <VineArtPaths art={{ ...vine.art, leaves: ["", "", ""], veins: "" }} />
      ) : (
        <path d={vine.line} fill="none" stroke={BARK} strokeWidth={2.4} strokeLinecap="round" />
      )}
    </svg>
  );
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
