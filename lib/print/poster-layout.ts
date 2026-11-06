/**
 * How the whole family fits on a sheet of paper: which way up, how big, and
 * whether the names will be readable once printed. Pure (no browser, no PDF
 * library), so the size picker can answer before anything is generated.
 */

import type { Rect } from "@/lib/graph/geometry";
import { LANE_STEP, NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph/node-size";
import type { GraphEdge, GraphNode } from "@/lib/graph/transform";

export type PaperId = "A3" | "A2" | "A1" | "A0";

/** ISO A sizes in PDF points (1 pt = 1/72 inch), short side first, plus millimetres to show people. */
export const PAPERS: Record<PaperId, { short: number; long: number; mm: [number, number] }> = {
  A3: { short: 841.89, long: 1190.55, mm: [297, 420] },
  A2: { short: 1190.55, long: 1683.78, mm: [420, 594] },
  A1: { short: 1683.78, long: 2383.94, mm: [594, 841] },
  A0: { short: 2383.94, long: 3370.39, mm: [841, 1189] },
};
export const PAPER_IDS: PaperId[] = ["A3", "A2", "A1", "A0"];

/** Size of a printed name on a standard card, in canvas units (a card is NODE_WIDTH units across). */
export const NAME_UNITS = 21;
/** A tiny family on a huge sheet stays a sensible size rather than filling the wall. */
const MAX_SCALE = 6;
/** Spare height goes to the cards first: taller cards hold a bigger photo and a bigger name. */
const MAX_CARD_GROWTH = 92;
/** Whatever is left opens up the rows, so the vines fill the sheet (units per gap). */
const MAX_ROW_STRETCH = 240;
/** Room for leaves that reach past the outermost cards. */
const LEAF_PAD = 32;

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Where every card sits on the canvas (reference cards are stored relative to their host). */
export function absolutePositions(nodes: GraphNode[]): Map<string, Rect> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Rect>();
  for (const n of nodes) {
    const host = n.parentId ? byId.get(n.parentId) : undefined;
    out.set(n.id, { x: n.position.x + (host?.position.x ?? 0), y: n.position.y + (host?.position.y ?? 0) });
  }
  return out;
}

export function treeBounds(nodes: GraphNode[], edges: GraphEdge[]): Bounds {
  const rects = [...absolutePositions(nodes).values()];
  if (rects.length === 0) return { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT };
  const lane = Math.max(0, ...edges.map((e) => e.data?.lane ?? 0));
  return {
    minX: Math.min(...rects.map((r) => r.x)) - LEAF_PAD,
    minY: Math.min(...rects.map((r) => r.y)) - LEAF_PAD,
    maxX: Math.max(...rects.map((r) => r.x)) + NODE_WIDTH + LEAF_PAD,
    maxY: Math.max(...rects.map((r) => r.y)) + NODE_HEIGHT + LEAF_PAD + lane * LANE_STEP,
  };
}

export type PosterFit = {
  pageWidth: number;
  pageHeight: number;
  orientation: "portrait" | "landscape";
  /** Points per canvas unit. */
  scale: number;
  margin: number;
  /** Height of the title block under the top margin. */
  headerHeight: number;
  /** Canvas x/y of the tree's top-left corner maps to page x/y (measured from the page's top-left). */
  originX: number;
  originY: number;
  /** Height of a card on this sheet, in canvas units (its width never changes). */
  cardHeight: number;
  /** How much bigger than standard this sheet's photos and words are. */
  cardZoom: number;
  /** How far each row sits below the one above, beyond the screen layout. */
  rowShift: number;
  /** The tree's height on this sheet, in canvas units. */
  treeHeight: number;
};

function fitOn(pageWidth: number, pageHeight: number, b: Bounds, rows: number): Omit<PosterFit, "orientation"> {
  const shortSide = Math.min(pageWidth, pageHeight);
  const margin = shortSide * 0.03;
  const headerHeight = shortSide * 0.085;
  const availW = pageWidth - margin * 2;
  const availH = pageHeight - margin * 2 - headerHeight;
  const treeW = b.maxX - b.minX;
  const treeH = b.maxY - b.minY;
  const scale = Math.min(availW / treeW, availH / treeH, MAX_SCALE);
  // A wide family leaves spare height. Spend it on bigger cards, then on longer vines.
  const spare = Math.max(0, availH / scale - treeH);
  const growth = Math.min(spare / Math.max(1, rows), MAX_CARD_GROWTH);
  const rest = spare - growth * Math.max(1, rows);
  const stretch = rows > 1 ? Math.min(rest / (rows - 1), MAX_ROW_STRETCH) : 0;
  const treeHeight = treeH + growth * Math.max(1, rows) + stretch * Math.max(0, rows - 1);
  return {
    pageWidth,
    pageHeight,
    scale,
    margin,
    headerHeight,
    cardHeight: NODE_HEIGHT + growth,
    cardZoom: (NODE_HEIGHT + growth) / NODE_HEIGHT,
    rowShift: growth + stretch,
    treeHeight,
    originX: (pageWidth - treeW * scale) / 2 - b.minX * scale,
    originY: margin + headerHeight + (availH - treeHeight * scale) / 2 - b.minY * scale,
  };
}

/** Whichever way up prints the bigger names wins, so a wide family prints landscape. */
export function fitPoster(b: Bounds, paper: PaperId, rows: number): PosterFit {
  const { short, long } = PAPERS[paper];
  const landscape = fitOn(long, short, b, rows);
  const portrait = fitOn(short, long, b, rows);
  return nameSizePt(landscape) >= nameSizePt(portrait) ? { ...landscape, orientation: "landscape" } : { ...portrait, orientation: "portrait" };
}

/** How many distinct rows (generations) the cards sit in. */
export function rowCount(nodes: GraphNode[]): number {
  return new Set([...absolutePositions(nodes).values()].map((r) => Math.round(r.y))).size;
}

/**
 * Where each card sits on this sheet: every row moves down by `rowShift` per row
 * above it, and every card takes the sheet's height, so the vines (which read
 * these rectangles) meet the cards exactly.
 */
export function posterCards(positions: Map<string, Rect>, fit: Pick<PosterFit, "rowShift" | "cardHeight">): Map<string, Rect> {
  const rows = [...new Set([...positions.values()].map((r) => Math.round(r.y)))].sort((a, b) => a - b);
  const rowOf = new Map(rows.map((y, i) => [y, i]));
  const out = new Map<string, Rect>();
  for (const [id, r] of positions) {
    out.set(id, { x: r.x, y: r.y + (rowOf.get(Math.round(r.y)) ?? 0) * fit.rowShift, width: NODE_WIDTH, height: fit.cardHeight });
  }
  return out;
}

export type Legibility = "clear" | "close" | "tiny";

/** Printed size of a name on this sheet: 9pt reads at arm's length, 5pt only up close. */
export function nameSizePt(fit: Pick<PosterFit, "scale" | "cardZoom">): number {
  return NAME_UNITS * fit.cardZoom * fit.scale;
}
export function legibility(fit: Pick<PosterFit, "scale" | "cardZoom">): Legibility {
  const pt = nameSizePt(fit);
  return pt >= 9 ? "clear" : pt >= 5 ? "close" : "tiny";
}

/** The smallest (cheapest) sheet where names read comfortably, or the biggest there is. */
export function recommendedPaper(b: Bounds, rows: number): PaperId {
  return PAPER_IDS.find((id) => legibility(fitPoster(b, id, rows)) === "clear") ?? "A0";
}
