"use client";

import { useMemo } from "react";
import { useStore, type EdgeProps, type ReactFlowState } from "@xyflow/react";
import { VineArtPaths } from "./VineArtPaths";
import { familyVineFromCards } from "@/lib/graph/vines";
import type { Rect } from "@/lib/graph/geometry";
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
 * One family's vine: a trunk dropping from the middle of the couple's own line
 * (or a single parent's card), limbs reaching out, and a twig to each child.
 * Reads absolute positions live so it follows cards while dragging.
 */
export function FamilyBranchEdge({ id, data }: EdgeProps) {
  const { childIds = [], partnerNodeIds, lane = 0, highlight } = (data ?? {}) as Partial<FamilyBranchData>;
  const ids: string[] = [...childIds];
  for (const pid of partnerNodeIds ?? []) if (pid) ids.push(pid);

  const rects = useStore((s: ReactFlowState) => {
    const out: Positions = {};
    for (const nid of ids) {
      const n = s.nodeLookup.get(nid);
      if (n) out[nid] = { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y };
    }
    return out;
  }, rectsEqual);

  const [aId, bId] = partnerNodeIds ?? [null, null];
  const vine = useMemo(() => {
    const a = aId ? rects[aId] : undefined;
    if (!a) return null;
    const kids = childIds.filter((c) => rects[c]).map((c) => ({ id: c, rect: rects[c], width: NODE_WIDTH }));
    return familyVineFromCards({ a, b: (bId && rects[bId]) || null, lane }, kids, id);
    // childIds is rebuilt each render; `rects` already changes whenever the cards it names do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rects, aId, bId, lane, id]);
  if (!vine) return null;

  const dimmed = !!highlight;
  const base = (
    <g opacity={dimmed ? DIM_OPACITY : 1}>
      <VineArtPaths art={vine.art} />
    </g>
  );

  // Relationship finder: trace ONLY the route — trunk, the limb out to each lit
  // child, then that child's twig — never the whole vine.
  const lit = highlight?.childIds ?? [];
  if (!highlight?.on || lit.length === 0) return base;
  const routeD = vine.routeTo(lit);
  return (
    <g>
      {base}
      <path d={routeD} style={{ stroke: "var(--path-soft)", strokeWidth: 10, fill: "none" }} strokeLinecap="round" strokeLinejoin="round" />
      <path d={routeD} style={{ stroke: "var(--path)", strokeWidth: 4, fill: "none" }} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
