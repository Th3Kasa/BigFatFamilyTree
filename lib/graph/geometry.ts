/**
 * Line geometry shared by the marriage line (SpouseEdge) and the children's
 * bracket (FamilyBranchEdge), so children always hang from exactly the middle
 * of their own parents' line. Pure: unit tested in geometry.test.ts.
 */

import { LANE_STEP, NODE_HEIGHT, NODE_WIDTH } from "./node-size";

export type Rect = { x: number; y: number; width?: number; height?: number };

/** How far in from a card's inner edge a "low" marriage line drops. */
const LOW_INSET = 28;

export type CoupleLine = {
  /** SVG path of the marriage line. */
  d: string;
  /** Where the children's bracket starts: the middle of this couple's line. */
  anchor: { x: number; y: number };
  /** A spot for the marriage label (above an adjacent line, below a low one). */
  label: { x: number; y: number; placement: "above" | "below" };
};

/**
 * The line between two partners' cards. `lane` 0 is a direct line between
 * neighbouring cards at mid height. When other cards sit between the partners
 * (a third marriage, for instance) the line instead runs under the row, in its
 * own lane (1, 2, ...), so it never passes behind someone else's card.
 */
export function coupleLine(a: Rect, b: Rect, lane = 0): CoupleLine {
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const lw = left.width ?? NODE_WIDTH;
  const lh = left.height ?? NODE_HEIGHT;
  const rh = right.height ?? NODE_HEIGHT;

  if (lane <= 0) {
    const sx = left.x + lw;
    const tx = right.x;
    const sy = left.y + lh / 2;
    const ty = right.y + rh / 2;
    const y = Math.max(sy, ty);
    const parts: string[] = [];
    if (sy < y) parts.push(`M ${sx} ${sy} L ${sx} ${y}`);
    if (ty < y) parts.push(`M ${tx} ${ty} L ${tx} ${y}`);
    parts.push(`M ${sx} ${y} L ${tx} ${y}`);
    const mid = (sx + tx) / 2;
    return { d: parts.join(" "), anchor: { x: mid, y }, label: { x: mid, y: y - 10, placement: "above" } };
  }

  const sx = left.x + lw - LOW_INSET;
  const tx = right.x + LOW_INSET;
  const sb = left.y + lh;
  const tb = right.y + rh;
  const y = Math.max(sb, tb) + LANE_STEP * lane;
  const d = `M ${sx} ${sb} L ${sx} ${y} L ${tx} ${y} L ${tx} ${tb}`;
  const mid = (sx + tx) / 2;
  return { d, anchor: { x: mid, y }, label: { x: mid, y: y + 12, placement: "below" } };
}

/** Bottom-centre of a single parent's card. */
export function soloAnchor(r: Rect): { x: number; y: number } {
  return { x: r.x + (r.width ?? NODE_WIDTH) / 2, y: r.y + (r.height ?? NODE_HEIGHT) };
}

/**
 * Number of cards strictly between two partners on the same row, used as the
 * lane of their marriage line (0 = neighbours).
 */
export function laneBetween(a: Rect, b: Rect, others: Rect[]): number {
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const rowY = (left.y + right.y) / 2;
  if (Math.abs(left.y - right.y) > NODE_HEIGHT / 2) return 0;
  let n = 0;
  for (const o of others) {
    if (o === a || o === b) continue;
    if (Math.abs(o.y - rowY) < NODE_HEIGHT / 2 && o.x > left.x + 1 && o.x < right.x - 1) n++;
  }
  return Math.min(n, 3);
}
