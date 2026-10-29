"use client";

import { useStore, ViewportPortal } from "@xyflow/react";
import { ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROW_HEIGHT } from "@/lib/graph/layout";
import { NODE_HEIGHT } from "@/lib/graph/node-size";
import { FAR_ZOOM } from "@/lib/graph/viewport";
import type { BranchLabel, GenerationRow } from "@/lib/graph/generations";

const arabicDigits = (n: number) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/** Space kept clear at the top (view toggle) and bottom (zoom controls) of the canvas. */
const TOP_CLEAR = 64;
const BOTTOM_CLEAR = 76;
const CHIP_H = 44;

/**
 * Generation buttons down the left edge of the full tree. Each one minimises
 * or restores its row. Zoomed in, a button sits level with its row; zoomed
 * out (rows closer than a button), they stack in a list instead.
 */
export function GenerationRail({ rows, lang, onToggle }: { rows: GenerationRow[]; lang: "ar" | "en"; onToggle: (index: number) => void }) {
  const [, ty, zoom] = useStore((s) => s.transform);
  const height = useStore((s) => s.height);
  if (rows.length < 2) return null;
  const t = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const aligned = ROW_HEIGHT * zoom >= CHIP_H + 8;

  const chip = (r: GenerationRow, style?: React.CSSProperties) => {
    const n = r.index + 1;
    const name = lang === "ar" ? `الجيل ${arabicDigits(n)}` : `Gen ${n}`;
    const Closed = lang === "ar" ? ChevronLeft : ChevronRight;
    return (
      <button
        key={r.index}
        type="button"
        onClick={() => onToggle(r.index)}
        aria-expanded={!r.collapsed}
        aria-label={
          r.collapsed
            ? t(`Show generation ${n} (${r.count} people)`, `إظهار الجيل ${arabicDigits(n)} (${arabicDigits(r.count)} أشخاص)`)
            : t(`Minimise generation ${n} (${r.count} people)`, `تصغير الجيل ${arabicDigits(n)} (${arabicDigits(r.count)} أشخاص)`)
        }
        style={style}
        className={cn(
          "pointer-events-auto inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-full border bg-[var(--card)] pe-3 ps-2 text-[13px] font-semibold shadow-[var(--shadow-floating)] transition-colors hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          r.collapsed ? "border-dashed border-[var(--border-strong)] text-[var(--muted-foreground)]" : "border-[var(--border-strong)] text-[var(--foreground)]",
        )}
      >
        {r.collapsed ? <Closed aria-hidden className="h-4 w-4" /> : <ChevronDown aria-hidden className="h-4 w-4" />}
        <span aria-hidden>
          {name}
          {r.collapsed && <span className="font-normal">{t(` · ${r.count} hidden`, ` · ${arabicDigits(r.count)} مخفيون`)}</span>}
        </span>
      </button>
    );
  };

  if (!aligned) {
    return (
      <nav aria-label={t("Generations", "الأجيال")} className="pointer-events-none absolute start-3 top-[68px] z-20 flex max-h-[calc(100%-150px)] flex-col items-start gap-1.5 overflow-y-auto md:start-4">
        {rows.map((r) => chip(r))}
      </nav>
    );
  }

  return (
    <nav aria-label={t("Generations", "الأجيال")} className="pointer-events-none absolute inset-y-0 start-3 z-20 md:start-4">
      {rows.map((r) => {
        const top = ty + r.centerY * zoom - CHIP_H / 2;
        if (top < TOP_CLEAR || top > height - BOTTOM_CLEAR - CHIP_H) return null;
        return chip(r, { position: "absolute", top, insetInlineStart: 0 });
      })}
    </nav>
  );
}

/** Zoomed far out, family names label each branch instead of unreadable cards. */
export function BranchLabels({ labels }: { labels: BranchLabel[] }) {
  const zoom = useStore((s) => s.transform[2]);
  if (zoom >= FAR_ZOOM) return null;
  const fontSize = 16 / zoom;
  return (
    <ViewportPortal>
      {labels.map((l) => {
        // Only where the branch is wide enough on screen to hold its name.
        if (l.width * zoom < l.name.length * 9 + 20) return null;
        return (
          <div
            key={l.key}
            aria-hidden
            className="pointer-events-none absolute select-none whitespace-nowrap rounded-full border border-[var(--border-strong)] bg-[var(--card)] font-bold text-[var(--foreground)]"
            style={{
              fontSize,
              padding: `${4 / zoom}px ${12 / zoom}px`,
              borderWidth: 1 / zoom,
              transform: `translate(${l.x}px, ${l.y + NODE_HEIGHT / 2}px) translate(-50%, -50%)`,
            }}
          >
            {l.name}
          </div>
        );
      })}
    </ViewportPortal>
  );
}
