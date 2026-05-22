"use client";

import { useNodes, type EdgeProps } from "@xyflow/react";

const NODE_WIDTH = 220;
const MID_Y = 120; // NODE_HEIGHT / 2 — same constant as FamilyBranchEdge

type SpouseData = {
  edgeKind: "spouse";
  relationshipId?: string;
  status?: "current" | "divorced" | "widowed";
};

// Renders the marriage line as a guaranteed-horizontal segment at the LOWER
// of the two spouses' mid-heights, with vertical stubs connecting each spouse
// to that horizontal line when they sit at different heights.
// This Y formula exactly matches FamilyBranchEdge's startY calculation so the
// T-junction bracket always hangs from the same line visually.
export function SpouseEdge({ source, target, selected, data }: EdgeProps) {
  const nodes = useNodes();
  const srcNode = nodes.find((n) => n.id === source);
  const tgtNode = nodes.find((n) => n.id === target);
  if (!srcNode || !tgtNode) return null;

  const { status = "current" } = (data ?? {}) as SpouseData;

  // Right-handle of source (left spouse), left-handle of target (right spouse)
  const srcRight = srcNode.position.x + NODE_WIDTH;
  const srcMidY  = srcNode.position.y + MID_Y;
  const tgtLeft  = tgtNode.position.x;
  const tgtMidY  = tgtNode.position.y + MID_Y;

  // Marriage bar is always at the lower mid-height.
  // FamilyBranchEdge uses the same Math.max so the T-junction aligns perfectly.
  const lineY = Math.max(srcMidY, tgtMidY);

  const parts: string[] = [];
  if (srcMidY < lineY) parts.push(`M ${srcRight} ${srcMidY} L ${srcRight} ${lineY}`);
  if (tgtMidY < lineY) parts.push(`M ${tgtLeft} ${tgtMidY} L ${tgtLeft} ${lineY}`);
  parts.push(`M ${srcRight} ${lineY} L ${tgtLeft} ${lineY}`);

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
      {/* Wider invisible path so the thin line is easy to click */}
      <path
        d={d}
        style={{ stroke: "transparent", strokeWidth: 14, fill: "none", cursor: "pointer" }}
      />
    </>
  );
}
