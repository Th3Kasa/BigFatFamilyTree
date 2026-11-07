import { describe, expect, test } from "vitest";
import { PAPER_IDS, PAPERS, absolutePositions, fitPoster, legibility, nameSizePt, posterCards, recommendedPaper, rowCount, treeBounds, type Bounds } from "./poster-layout";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph/node-size";
import type { GraphEdge, GraphNode } from "@/lib/graph/transform";

const node = (id: string, x: number, y: number, parentId?: string) => ({ id, position: { x, y }, parentId }) as unknown as GraphNode;

describe("absolutePositions", () => {
  test("reference cards are placed relative to their host", () => {
    const abs = absolutePositions([node("host", 100, 200), node("ref", 240, 0, "host")]);
    expect(abs.get("ref")).toEqual({ x: 340, y: 200 });
  });
});

describe("treeBounds", () => {
  test("covers every card, with room for leaves and low marriage lines", () => {
    const edges = [{ data: { lane: 2 } }] as unknown as GraphEdge[];
    const b = treeBounds([node("a", 0, 0), node("b", 1000, 500)], edges);
    expect(b.minX).toBeLessThan(0);
    expect(b.maxX).toBeGreaterThan(1000 + NODE_WIDTH);
    expect(b.maxY).toBeGreaterThan(500 + NODE_HEIGHT + 2 * 16);
  });
  test("an empty tree still has a size", () => {
    expect(treeBounds([], []).maxX).toBeGreaterThan(0);
  });
});

describe("fitPoster", () => {
  const wide: Bounds = { minX: 0, minY: 0, maxX: 8000, maxY: 1200 };
  const tall: Bounds = { minX: 0, minY: 0, maxX: 900, maxY: 6000 };

  test("a wide family prints landscape and a tall one portrait", () => {
    expect(fitPoster(wide, "A2", 5).orientation).toBe("landscape");
    expect(fitPoster(tall, "A2", 5).orientation).toBe("portrait");
  });

  test("everything stays on the sheet, inside the margins and under the title", () => {
    for (const paper of PAPER_IDS) {
      for (const b of [wide, tall]) {
        const f = fitPoster(b, paper, 5);
        const left = f.originX + b.minX * f.scale;
        const right = f.originX + b.maxX * f.scale;
        const top = f.originY + b.minY * f.scale;
        const bottom = f.originY + (b.minY + f.treeHeight) * f.scale;
        expect(left).toBeGreaterThanOrEqual(f.margin - 0.01);
        expect(right).toBeLessThanOrEqual(f.pageWidth - f.margin + 0.01);
        expect(top).toBeGreaterThanOrEqual(f.margin + f.headerHeight - 0.01);
        expect(bottom).toBeLessThanOrEqual(f.pageHeight - f.margin + 0.01);
      }
    }
  });

  test("bigger paper means bigger names, every step", () => {
    const scales = PAPER_IDS.map((p) => fitPoster(wide, p, 5).scale);
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeGreaterThan(scales[i - 1]);
  });

  test("a tiny family does not blow up to fill an A0 wall", () => {
    expect(fitPoster({ minX: 0, minY: 0, maxX: 400, maxY: 200 }, "A0", 1).scale).toBeLessThanOrEqual(6);
  });

  test("A sizes are the real ISO ones", () => {
    expect(PAPERS.A0.mm).toEqual([841, 1189]);
    expect(PAPERS.A3.long / PAPERS.A3.short).toBeCloseTo(Math.SQRT2, 2);
  });
});

describe("posterCards", () => {
  test("each row moves down by one more step, stays level, and takes the sheet's card height", () => {
    const pos = new Map([["a", { x: 0, y: 0 }], ["b", { x: 10, y: 0 }], ["c", { x: 0, y: 248 }]]);
    const out = posterCards(pos, { rowShift: 100, cardHeight: 200 });
    expect(out.get("a")).toEqual({ x: 0, y: 0, width: NODE_WIDTH, height: 200 });
    expect(out.get("b")!.y).toBe(0);
    expect(out.get("c")!.y).toBe(348);
  });
});

describe("spare height", () => {
  const wide: Bounds = { minX: 0, minY: 0, maxX: 8000, maxY: 1200 };

  test("a wide family gets bigger cards, so names print bigger than the width alone allows", () => {
    const f = fitPoster(wide, "A2", 4);
    expect(f.cardHeight).toBeGreaterThan(NODE_HEIGHT);
    expect(f.cardZoom).toBeGreaterThan(1);
    expect(nameSizePt(f)).toBeGreaterThan(21 * f.scale);
  });

  test("a family that already fills the height keeps standard cards", () => {
    const f = fitPoster({ minX: 0, minY: 0, maxX: 500, maxY: 9000 }, "A3", 8);
    expect(f.cardHeight).toBe(NODE_HEIGHT);
    expect(f.rowShift).toBe(0);
  });

  test("the extra height is exactly accounted for", () => {
    const f = fitPoster(wide, "A1", 4);
    expect(f.treeHeight).toBeCloseTo(1200 + (f.cardHeight - NODE_HEIGHT) * 4 + (f.rowShift - (f.cardHeight - NODE_HEIGHT)) * 3, 5);
  });
});

describe("rowCount", () => {
  test("counts generations, not cards", () => {
    expect(rowCount([node("a", 0, 0), node("b", 200, 0), node("c", 0, 248)])).toBe(2);
  });
});

describe("readability", () => {
  test("names are graded by their printed size", () => {
    expect(nameSizePt({ scale: 0.5, cardZoom: 1 })).toBeCloseTo(10.5);
    expect(legibility({ scale: 0.5, cardZoom: 1 })).toBe("clear");
    expect(legibility({ scale: 0.3, cardZoom: 1 })).toBe("close");
    expect(legibility({ scale: 0.3, cardZoom: 1.5 })).toBe("clear");
    expect(legibility({ scale: 0.1, cardZoom: 1 })).toBe("tiny");
  });

  test("recommends the smallest sheet that reads well", () => {
    expect(recommendedPaper({ minX: 0, minY: 0, maxX: 2000, maxY: 800 }, 4)).toBe("A3");
    expect(recommendedPaper({ minX: 0, minY: 0, maxX: 7000, maxY: 1200 }, 4)).toBe("A1");
  });

  test("falls back to the biggest sheet when even that is small", () => {
    expect(recommendedPaper({ minX: 0, minY: 0, maxX: 100000, maxY: 1200 }, 4)).toBe("A0");
  });
});
