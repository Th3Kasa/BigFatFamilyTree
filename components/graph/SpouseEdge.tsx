"use client";

import type { EdgeProps } from "@xyflow/react";

type SpouseData = {
  edgeKind: "spouse";
  relationshipId?: string;
  status?: "current" | "divorced" | "widowed";
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
  const { status = "current" } = (data ?? {}) as SpouseData;

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

  const strokeColor =
    status === "divorced" ? "oklch(0.62 0.20 18 / 0.55)" :
    status === "widowed"  ? "oklch(0.48 0.03 25 / 0.60)" :
    "oklch(0.62 0.20 18 / 0.70)";

  const strokeDash =
    status === "divorced" ? "6 5" :
    status === "widowed"  ? "2 4" :
    undefined;

  return (
    <>
      <path
        d={d}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 3 : 2,
          fill: "none",
          strokeDasharray: strokeDash,
        }}
      />
      {/* Wider invisible path for easier clicking on a thin line */}
      <path
        d={d}
        style={{ stroke: "transparent", strokeWidth: 14, fill: "none", cursor: "pointer" }}
      />
    </>
  );
}
