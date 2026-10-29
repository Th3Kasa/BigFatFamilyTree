"use client";

import { useStore, type EdgeProps, type ReactFlowState } from "@xyflow/react";
import { EDGE_STYLES, GHOST_OPACITY, WIDOWED_GLYPH } from "@/lib/graph/edge-styles";
import { coupleLine } from "@/lib/graph/geometry";
import { DIM_OPACITY, type EdgeHighlight } from "@/lib/graph/highlight";
import { marriageLabel } from "@/lib/graph/family-view";
import { COMPACT_ZOOM } from "@/lib/graph/viewport";

type SpouseData = {
  edgeKind: "spouse";
  status?: "current" | "divorced" | "widowed";
  /** True when this is a past relationship of a remarried person. */
  ghost?: boolean;
  /** True when either spouse has more than one marriage. */
  showOrder?: boolean;
  /** 1st, 2nd … from the perspective of the partner with several marriages. */
  ordinal?: number | null;
  /** Co-parents with no recorded marriage: a quiet line, just so the children have a couple to hang from. */
  implicit?: boolean;
  /** 0 = neighbours; 1+ = runs under the row past the cards in between. */
  lane?: number;
  lang?: "ar" | "en";
  /** Relationship-finder highlight; present only while a path is active. */
  highlight?: EdgeHighlight;
};

type XY = { x: number; y: number };
const same = (a: [XY, XY] | null, b: [XY, XY] | null) =>
  a === b || (!!a && !!b && a[0].x === b[0].x && a[0].y === b[0].y && a[1].x === b[1].x && a[1].y === b[1].y);

/**
 * Marriage line. Uses the same geometry as the children's bracket, so a
 * couple's children always hang from the middle of this exact line. Past
 * marriages are soft (dashed, lighter) and labelled "1st marriage · widowed".
 */
export function SpouseEdge({ source, target, data }: EdgeProps) {
  const { status = "current", ghost = false, showOrder = false, ordinal, implicit = false, lane = 0, lang = "en", highlight } =
    (data ?? {}) as SpouseData;

  const ends = useStore((s: ReactFlowState): [XY, XY] | null => {
    const a = s.nodeLookup.get(source);
    const b = s.nodeLookup.get(target);
    return a && b ? [a.internals.positionAbsolute, b.internals.positionAbsolute] : null;
  }, same);
  const compact = useStore((s: ReactFlowState) => s.transform[2] < COMPACT_ZOOM);
  if (!ends) return null;

  const onPath = !!highlight?.on;
  const dimmed = !!highlight && !highlight.on;
  const line = coupleLine(ends[0], ends[1], lane);

  const style = implicit
    ? { stroke: EDGE_STYLES.parentChild.stroke, dash: "1 5" }
    : status === "divorced" ? EDGE_STYLES.coupleDivorced
    : status === "widowed" ? EDGE_STYLES.coupleWidowed
    : EDGE_STYLES.coupleCurrent;
  const stroke = onPath ? "var(--path)" : style.stroke;
  const past = status !== "current";
  const soft = !onPath && (ghost || past) ? GHOST_OPACITY + 0.15 : 1;
  const label = !compact && !implicit && (showOrder || past) ? marriageLabel(showOrder ? ordinal : null, status, lang) : "";

  return (
    <g opacity={dimmed ? DIM_OPACITY : 1}>
      {/* The line itself is soft for past marriages; the label stays full strength so it is readable. */}
      <g opacity={onPath ? 1 : soft}>
        {onPath && <path d={line.d} style={{ stroke: "var(--path-soft)", strokeWidth: 10, fill: "none" }} strokeLinecap="round" />}
        <path
          d={line.d}
          style={{ stroke, strokeWidth: onPath ? 4 : implicit ? 1.5 : 2, fill: "none", strokeDasharray: style.dash }}
          strokeLinejoin="round"
        />
      </g>
      {status === "widowed" && !label && (
        <text x={line.label.x} y={line.label.y} textAnchor="middle" style={{ fill: stroke, fontSize: 12, fontWeight: 600, pointerEvents: "none" }}>
          {WIDOWED_GLYPH}
        </text>
      )}
      {label && <MarriageLabel x={line.label.x} y={line.label.y} below={line.label.placement === "below"} text={label} color={stroke} lang={lang} />}
    </g>
  );
}

/**
 * Two short lines ("1st marriage" / "widowed") so the label fits in the gap
 * between partners, on a white backing so it stays readable over other lines.
 */
function MarriageLabel({ x, y, below, text, color, lang }: { x: number; y: number; below: boolean; text: string; color: string; lang: "ar" | "en" }) {
  const lines = text.split(" · ");
  const lh = 12;
  const top = below ? y : y - (lines.length - 1) * lh;
  return (
    <text
      x={x}
      y={top}
      textAnchor="middle"
      direction={lang === "ar" ? "rtl" : "ltr"}
      style={{ fill: color, fontSize: 10.5, fontWeight: 700, paintOrder: "stroke", stroke: "#FFFFFF", strokeWidth: 4, strokeLinejoin: "round", pointerEvents: "none" }}
    >
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}
