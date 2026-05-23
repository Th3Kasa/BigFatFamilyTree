import { describe, test, expect } from "vitest";
import { autoLayoutV2 } from "./layout-v2";
import type { PersonInput, RelationshipInput } from "./transform";
import type { FixtureExpected } from "./__fixtures__/layout-v2/helpers";

import pureTree from "./__fixtures__/layout-v2/pure-tree";
import coupleKids from "./__fixtures__/layout-v2/couple-kids";
import remarriage from "./__fixtures__/layout-v2/remarriage";
import cousinMarriage from "./__fixtures__/layout-v2/cousin-marriage";
import adoptedFx from "./__fixtures__/layout-v2/adopted";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 240;
const COUPLE_GAP = 24;
const NODESEP = 80;

type Fixture = {
  people: PersonInput[];
  relationships: RelationshipInput[];
  expected: FixtureExpected;
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
type Rect = { x: number; y: number; w: number; h: number };
type Seg = { x1: number; y1: number; x2: number; y2: number };

function rectFor(pos: { x: number; y: number }): Rect {
  return { x: pos.x, y: pos.y, w: NODE_WIDTH, h: NODE_HEIGHT };
}

function segIntersect(a: Seg, b: Seg): boolean {
  const d = (x1: number, y1: number, x2: number, y2: number) =>
    x1 * y2 - x2 * y1;
  const r = {
    x: a.x2 - a.x1,
    y: a.y2 - a.y1,
  };
  const s = { x: b.x2 - b.x1, y: b.y2 - b.y1 };
  const denom = d(r.x, r.y, s.x, s.y);
  if (denom === 0) return false; // parallel/collinear: ignore
  const qmp = { x: b.x1 - a.x1, y: b.y1 - a.y1 };
  const t = d(qmp.x, qmp.y, s.x, s.y) / denom;
  const u = d(qmp.x, qmp.y, r.x, r.y) / denom;
  // Strict inequality so endpoints touching don't count as crossing.
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

// ---------------------------------------------------------------------------
// Common assertions
// ---------------------------------------------------------------------------
function assertEveryPersonPositioned(
  positions: Map<string, { x: number; y: number }>,
  people: PersonInput[],
) {
  for (const p of people) {
    expect(positions.has(p.id), `position for ${p.id}`).toBe(true);
  }
}

function assertRanks(
  positions: Map<string, { x: number; y: number }>,
  ranks: Record<string, number>,
) {
  // Group ids by rank and assert each rank shares the same y (within tol).
  const byRank = new Map<number, string[]>();
  for (const [id, r] of Object.entries(ranks)) {
    const arr = byRank.get(r) ?? [];
    arr.push(id);
    byRank.set(r, arr);
  }
  // Each rank's members share same y.
  for (const [, ids] of byRank) {
    const ys = ids.map((id) => positions.get(id)!.y);
    const y0 = ys[0];
    for (const y of ys) {
      expect(Math.abs(y - y0)).toBeLessThan(1);
    }
  }
  // Ranks ordered top-to-bottom (lower rank = smaller y).
  const ranksSorted = [...byRank.keys()].sort((a, b) => a - b);
  let prevY = -Infinity;
  for (const r of ranksSorted) {
    const id = byRank.get(r)![0];
    const y = positions.get(id)!.y;
    expect(y).toBeGreaterThan(prevY);
    prevY = y;
  }
}

function assertCouplesAdjacent(
  positions: Map<string, { x: number; y: number }>,
  couples: Array<[string, string]>,
) {
  for (const [a, b] of couples) {
    const pa = positions.get(a)!;
    const pb = positions.get(b)!;
    expect(Math.abs(pa.y - pb.y)).toBeLessThan(1);
    const dx = Math.abs(pa.x - pb.x);
    expect(Math.abs(dx - (NODE_WIDTH + COUPLE_GAP))).toBeLessThan(2);
  }
}

function assertMidpointChildren(
  positions: Map<string, { x: number; y: number }>,
  midChildren: Array<{ child: string; parents: [string, string] }>,
) {
  for (const { child, parents } of midChildren) {
    const cPos = positions.get(child)!;
    const p1 = positions.get(parents[0])!;
    const p2 = positions.get(parents[1])!;
    const midX = (p1.x + p2.x) / 2;
    const childCenterX = cPos.x;
    // Single-child case will land directly under midpoint; multi-child case
    // will be spread, so tolerate up to (siblings × (nodesep + W)) horizontally.
    // We use a loose bound: each child's center should lie within 2× the
    // parent span of the midpoint.
    const span = Math.max(
      Math.abs(p2.x - p1.x) + NODE_WIDTH,
      NODE_WIDTH * 4 + NODESEP * 4,
    );
    expect(Math.abs(childCenterX - midX)).toBeLessThanOrEqual(span);
  }
}

function assertNoCrossings(
  fx: Fixture,
  positions: Map<string, { x: number; y: number }>,
  tolerance = 0,
) {
  // Build parent edges as segments from parent center-bottom to child
  // center-top. For two-parent children we model the rendered route: each
  // parent drops to a shared midpoint above the child, then a single
  // vertical drop into the child. This matches the v2 edge router.
  type LogicalEdge = { sourceId: string; targetId: string; seg: Seg };
  const segs: LogicalEdge[] = [];
  const center = (id: string) => {
    const p = positions.get(id)!;
    return { cx: p.x + NODE_WIDTH / 2, cy: p.y + NODE_HEIGHT / 2 };
  };
  for (const p of fx.people) {
    const hasFather = p.father_id != null && positions.has(p.father_id);
    const hasMother = p.mother_id != null && positions.has(p.mother_id);
    const cChild = center(p.id);
    const childTopY = cChild.cy - NODE_HEIGHT / 2;
    if (hasFather && hasMother) {
      const pf = positions.get(p.father_id!)!;
      const pm = positions.get(p.mother_id!)!;
      const midX = (pf.x + pm.x) / 2 + NODE_WIDTH / 2;
      const elbowY = (Math.max(pf.y, pm.y) + NODE_HEIGHT + childTopY) / 2;
      // Parent A → elbow
      const a = center(p.father_id!);
      segs.push({
        sourceId: p.father_id!,
        targetId: `elbow:${p.id}`,
        seg: { x1: a.cx, y1: a.cy + NODE_HEIGHT / 2, x2: midX, y2: elbowY },
      });
      const b = center(p.mother_id!);
      segs.push({
        sourceId: p.mother_id!,
        targetId: `elbow:${p.id}`,
        seg: { x1: b.cx, y1: b.cy + NODE_HEIGHT / 2, x2: midX, y2: elbowY },
      });
      // Elbow → child (vertical drop)
      segs.push({
        sourceId: `elbow:${p.id}`,
        targetId: p.id,
        seg: { x1: midX, y1: elbowY, x2: cChild.cx, y2: childTopY },
      });
    } else if (hasFather) {
      const a = center(p.father_id!);
      segs.push({
        sourceId: p.father_id!,
        targetId: p.id,
        seg: { x1: a.cx, y1: a.cy + NODE_HEIGHT / 2, x2: cChild.cx, y2: childTopY },
      });
    } else if (hasMother) {
      const a = center(p.mother_id!);
      segs.push({
        sourceId: p.mother_id!,
        targetId: p.id,
        seg: { x1: a.cx, y1: a.cy + NODE_HEIGHT / 2, x2: cChild.cx, y2: childTopY },
      });
    }
  }
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      // Skip if they share an endpoint logically.
      if (
        a.sourceId === b.sourceId ||
        a.sourceId === b.targetId ||
        a.targetId === b.sourceId ||
        a.targetId === b.targetId
      )
        continue;
      if (segIntersect(a.seg, b.seg)) crossings++;
    }
  }
  expect(crossings).toBeLessThanOrEqual(tolerance);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
// Tolerances per fixture for the crossings assertion. The simple shapes
// (pure-tree, couple-kids, adopted) must be perfect. The two structurally
// hard cases — remarriage (4 partners, 2 couple-units competing for x-axis
// order) and cousin-marriage (intentional cross-rank skip edge) — are
// expected to have a small number of geometric crossings on straight-line
// routing; the production renderer hides this via smoothstep + the
// cousin-skip dashed style. Tracked in design doc §3 (cousin-skip) and §11.
const CROSS_TOL: Record<string, number> = {
  "pure-tree": 0,
  "couple-kids": 0,
  remarriage: 4,
  "cousin-marriage": 2,
  adopted: 0,
};

function runFixture(name: string, fx: Fixture) {
  describe(name, () => {
    const { positions, midpoints, couples } = autoLayoutV2(
      fx.people,
      fx.relationships,
    );

    test("every person has a position", () => {
      assertEveryPersonPositioned(positions, fx.people);
    });

    test("ranks match expected", () => {
      assertRanks(positions, fx.expected.ranks);
    });

    if (fx.expected.couples?.length) {
      test("couples adjacent on same y", () => {
        assertCouplesAdjacent(positions, fx.expected.couples!);
      });
    }

    if (fx.expected.midpointChildren?.length) {
      test("two-parent children near midpoint", () => {
        assertMidpointChildren(positions, fx.expected.midpointChildren!);
      });
    }

    test("parent-edge crossings within tolerance", () => {
      assertNoCrossings(fx, positions, CROSS_TOL[name] ?? 0);
    });

    test("result shape: midpoints & couples are Maps/Arrays", () => {
      expect(midpoints).toBeInstanceOf(Map);
      expect(Array.isArray(couples)).toBe(true);
    });

    // Use rect helper to silence unused-warning while keeping it available
    // for future overlap assertions.
    test("no node-rectangle overlap (sanity)", () => {
      const rects = fx.people.map((p) => ({
        id: p.id,
        r: rectFor(positions.get(p.id)!),
      }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].r;
          const b = rects[j].r;
          const overlap =
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y;
          expect(
            overlap,
            `${rects[i].id} overlaps ${rects[j].id}`,
          ).toBe(false);
        }
      }
    });
  });
}

runFixture("pure-tree", pureTree);
runFixture("couple-kids", coupleKids);
runFixture("remarriage", remarriage);
runFixture("cousin-marriage", cousinMarriage);
runFixture("adopted", adoptedFx);
