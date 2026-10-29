"use client";

import { useStore, type EdgeProps, type ReactFlowState } from "@xyflow/react";
import { EDGE_STYLES } from "@/lib/graph/edge-styles";
import { coupleLine, soloAnchor, type Rect } from "@/lib/graph/geometry";
import { DIM_OPACITY, type EdgeHighlight } from "@/lib/graph/highlight";
import { NODE_WIDTH } from "@/lib/graph/node-size";

type FamilyBranchData = {
  edgeKind: "family-branch";
  childIds: string[];
  /** The couple (or single parent) these children belong to; may include a reference card. */
  partnerNodeIds: [string, string | null];
  lane?: number;
  /** Relationship-finder highlight; present only while a path is active. */
  highlight?: EdgeHighlight;
};

type Positions = Record<string, Rect>;

function rectsEqual(a: Positions, b: Positions): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k].x === b[k]?.x && a[k].y === b[k]?.y);
}

/**
 * Children's bracket for one family unit: a drop from the middle of the
 * couple's own line (or a single parent's card), a bar across, and a drop to
 * each child. Reads absolute positions live so it follows cards while dragging.
 */
export function FamilyBranchEdge({ data }: EdgeProps) {
  const { childIds = [], partnerNodeIds, lane = 0, highlight } = (data ?? {}) as Partial<FamilyBranchData>;
  const ids: string[] = [...childIds];
  for (const id of partnerNodeIds ?? []) if (id) ids.push(id);

  const rects = useStore((s: ReactFlowState) => {
    const out: Positions = {};
    for (const id of ids) {
      const n = s.nodeLookup.get(id);
      if (n) out[id] = { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y };
    }
    return out;
  }, rectsEqual);

  const [aId, bId] = partnerNodeIds ?? [null, null];
  const a = aId ? rects[aId] : undefined;
  const b = bId ? rects[bId] : undefined;
  if (!a) return null;
  const start = b ? coupleLine(a, b, lane).anchor : soloAnchor(a);

  const kids = childIds.map((id) => ({ id, r: rects[id] })).filter((k): k is { id: string; r: Rect } => !!k.r);
  if (kids.length === 0) return null;
  const xs = kids.map((k) => k.r.x + NODE_WIDTH / 2);
  const tops = kids.map((k) => k.r.y);
  const minTop = Math.min(...tops);
  const gap = minTop - start.y;
  // Never let the bar overshoot the topmost child, or the drop renders upward through a card.
  const junctionY = gap > 0 ? Math.min(start.y + Math.max(gap * 0.5, 20), minTop - 2) : (start.y + minTop) / 2;

  const parts = [`M ${start.x} ${start.y} L ${start.x} ${junctionY}`];
  const barLeft = Math.min(start.x, ...xs);
  const barRight = Math.max(start.x, ...xs);
  if (barRight > barLeft) parts.push(`M ${barLeft} ${junctionY} L ${barRight} ${junctionY}`);
  kids.forEach((_, i) => parts.push(`M ${xs[i]} ${junctionY} L ${xs[i]} ${tops[i]}`));

  const base = (
    <path
      d={parts.join(" ")}
      style={{ stroke: EDGE_STYLES.parentChild.stroke, strokeWidth: 2, fill: "none", opacity: highlight ? DIM_OPACITY : 1 }}
      strokeLinejoin="round"
    />
  );

  // Relationship finder: redraw ONLY the route — parent drop, the bar out to
  // each lit child, then that child's drop — never the whole bracket.
  const lit = new Set(highlight?.childIds ?? []);
  if (!highlight?.on || lit.size === 0) return base;
  const route: string[] = [`M ${start.x} ${start.y} L ${start.x} ${junctionY}`];
  kids.forEach((k, i) => {
    if (!lit.has(k.id)) return;
    route.push(`M ${start.x} ${junctionY} L ${xs[i]} ${junctionY}`, `M ${xs[i]} ${junctionY} L ${xs[i]} ${tops[i]}`);
  });
  const routeD = route.join(" ");
  return (
    <g>
      {base}
      <path d={routeD} style={{ stroke: "var(--path-soft)", strokeWidth: 10, fill: "none" }} strokeLinecap="round" strokeLinejoin="round" />
      <path d={routeD} style={{ stroke: "var(--path)", strokeWidth: 4, fill: "none" }} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
