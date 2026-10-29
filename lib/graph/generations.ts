/**
 * Generation rows of the full tree, and minimising them. A minimised
 * generation's cards and lines are hidden and the rows below move up, leaving
 * a slim slot so the generation rail can still offer "Show". Pure: tested in
 * generations.test.ts.
 */

import { ROW_HEIGHT } from "./layout";
import { NODE_HEIGHT } from "./node-size";
import type { GraphEdge, GraphNode } from "./transform";

/** Height a minimised generation keeps on the tree (room for its rail button). */
export const COLLAPSED_ROW = 56;

export type GenerationRow = {
  /** 0 = the top row of the tree. */
  index: number;
  /** People on the row (not counting reference cards). */
  count: number;
  collapsed: boolean;
  /** Middle of the row in flow coordinates, after earlier rows were minimised. */
  centerY: number;
};

const rowOf = (y: number) => Math.round(y / ROW_HEIGHT);

/** How far a row moves up because generations above it are minimised. */
function shiftFor(row: number, collapsed: ReadonlySet<number>): number {
  let above = 0;
  for (const c of collapsed) if (c < row) above++;
  return above * (ROW_HEIGHT - COLLAPSED_ROW);
}

export function generationRows(nodes: GraphNode[], collapsed: ReadonlySet<number>): GenerationRow[] {
  const counts = new Map<number, number>();
  for (const n of nodes) {
    if (n.type !== "person" || n.parentId) continue;
    const row = rowOf(n.position.y);
    counts.set(row, (counts.get(row) ?? 0) + 1);
  }
  return [...counts.keys()]
    .sort((a, b) => a - b)
    .map((index) => {
      const isCollapsed = collapsed.has(index);
      const top = index * ROW_HEIGHT - shiftFor(index, collapsed);
      return { index, count: counts.get(index)!, collapsed: isCollapsed, centerY: top + (isCollapsed ? COLLAPSED_ROW : NODE_HEIGHT) / 2 };
    });
}

/** Hide minimised generations (and every line touching them) and close the gaps. */
export function collapseGenerations(
  nodes: GraphNode[],
  edges: GraphEdge[],
  collapsed: ReadonlySet<number>,
): { nodes: (GraphNode & { hidden?: boolean })[]; edges: (GraphEdge & { hidden?: boolean })[] } {
  if (collapsed.size === 0) return { nodes, edges };
  const hidden = new Set<string>();
  const top = nodes.filter((n) => !n.parentId);
  for (const n of top) if (collapsed.has(rowOf(n.position.y))) hidden.add(n.id);
  // Reference cards ride on their host card (their position is relative to it).
  for (const n of nodes) if (n.parentId && hidden.has(n.parentId)) hidden.add(n.id);

  const outNodes = nodes.map((n) => {
    if (hidden.has(n.id)) return { ...n, hidden: true };
    if (n.parentId) return n;
    const shift = shiftFor(rowOf(n.position.y), collapsed);
    return shift ? { ...n, position: { x: n.position.x, y: n.position.y - shift } } : n;
  });

  const outEdges = edges.map((e) => {
    const d = e.data;
    const ids = [e.source, e.target, ...(d?.personIds ?? []), ...(d?.childIds ?? []), ...(d?.partnerNodeIds ?? [])];
    return ids.some((id) => id && hidden.has(id)) ? { ...e, hidden: true } : e;
  });
  return { nodes: outNodes, edges: outEdges };
}
