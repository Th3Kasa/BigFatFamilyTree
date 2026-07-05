"use client";

import type { EdgeProps } from "@xyflow/react";
import { EDGE_STYLES, GHOST_OPACITY, WIDOWED_GLYPH } from "@/lib/graph/edge-styles";

type SpouseData = {
  edgeKind: "spouse";
  relationshipId?: string;
  status?: "current" | "divorced" | "widowed";
  /** True when this is a past relationship of a remarried person. */
  ghost?: boolean;
  /** Marriage order (1st, 2nd, …). */
  orderIndex?: number;
  /** True when either spouse has more than one marriage. */
  showOrder?: boolean;
};

// Renders the marriage line as a guaranteed-horizontal segment.
// Uses sourceX/Y and targetX/Y from EdgeProps — React Flow keeps these
// in sync with every drag frame, eliminating the "gap during drag" bug
// that occurs when reading from useNodes() (which lags behind).
//
// The marriage bar sits at Math.max(sourceY, targetY) so it is always
// horizontal even when spouses are positioned at different heights.
// FamilyBranchEdge uses the same Math.max formula for its startY, so the
// T-junction bracket always hangs from exactly this line.
export function SpouseEdge({ sourceX, sourceY, targetX, targetY, selected, data }: EdgeProps) {
  const {
    status = "current",
    ghost = false,
    orderIndex,
    showOrder = false,
  } = (data ?? {}) as SpouseData;

  // Horizontal marriage bar at the LOWER of the two handle Y coordinates
  const lineY = Math.max(sourceY, targetY);

  const parts: string[] = [];
  // Vertical stub from source handle down to lineY (only when source is higher)
  if (sourceY < lineY) parts.push(`M ${sourceX} ${sourceY} L ${sourceX} ${lineY}`);
  // Vertical stub from target handle down to lineY (only when target is higher)
  if (targetY < lineY) parts.push(`M ${targetX} ${targetY} L ${targetX} ${lineY}`);
  // Horizontal marriage bar
  parts.push(`M ${sourceX} ${lineY} L ${targetX} ${lineY}`);

  const d = parts.join(" ");

  const style =
    status === "divorced" ? EDGE_STYLES.coupleDivorced :
    status === "widowed"  ? EDGE_STYLES.coupleWidowed :
    EDGE_STYLES.coupleCurrent;

  const midX = (sourceX + targetX) / 2;

  return (
    <g opacity={ghost ? GHOST_OPACITY : 1}>
      <path
        d={d}
        style={{
          stroke: style.stroke,
          strokeWidth: selected ? 3 : 2,
          fill: "none",
          strokeDasharray: style.dash,
        }}
      />
      {/* Wider invisible path for easier clicking on a thin line */}
      <path
        d={d}
        style={{ stroke: "transparent", strokeWidth: 14, fill: "none", cursor: "pointer" }}
      />
      {status === "widowed" ? (
        <text
          x={midX}
          y={lineY - 5}
          textAnchor="middle"
          style={{
            fill: style.stroke,
            fontSize: 12,
            fontWeight: 600,
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {WIDOWED_GLYPH}
        </text>
      ) : null}
      {/* Marriage-order badge — only shown when a spouse has >1 marriage,
          so polygamy / remarriage order is readable on the canvas. */}
      {showOrder && orderIndex != null ? (
        <g pointerEvents="none">
          <circle
            cx={midX}
            cy={lineY + 12}
            r={8}
            style={{ fill: "var(--background, white)", stroke: style.stroke, strokeWidth: 1.5 }}
          />
          <text
            x={midX}
            y={lineY + 12}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill: style.stroke, fontSize: 10, fontWeight: 700, userSelect: "none" }}
          >
            {orderIndex}
          </text>
        </g>
      ) : null}
    </g>
  );
}
