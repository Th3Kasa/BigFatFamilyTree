/**
 * Tree layout built on family units (see units.ts). The automatic layout is
 * the source of truth and is always tidy:
 *
 *  - **Rows are generations.** Every person sits in the row of their generation
 *    (oldest at the top). Couples share a row; a married-in partner takes their
 *    spouse's generation.
 *  - **Strips.** Each row cluster (a person born into the tree plus the
 *    partners and reference cards beside them) has exactly one parent union, so
 *    clusters form a forest. Every cluster gets its own vertical strip as wide
 *    as its widest descendant generation, and children of each marriage are
 *    grouped, in marriage order, under the line of the couple they belong to.
 *    Because generations only increase going down a branch and sibling strips
 *    never overlap, no two cards can overlap.
 *  - **Manual nudges.** An editor may slide a couple sideways within its row.
 *    That is stored as a horizontal offset (pos_x, with pos_y left empty) and
 *    re-applied on top of the automatic layout. A final sweep per row pushes
 *    clusters apart so nudges can never make cards overlap or interleave a
 *    couple. Older absolute positions (pos_y set) predate this layout and are
 *    ignored. "Tidy up" clears every offset.
 *
 * Pure: unit tested in layout.test.ts.
 */

import type { PersonInput, RelationshipInput } from "./transform";
import { buildFamilyModel, type Cluster, type FamilyModel, type Slot } from "./units";
import { GROUP_GAP, NODE_HEIGHT, NODE_WIDTH, PARTNER_GAP, ROW_GAP, SIBLING_GAP } from "./node-size";

export type Point = { x: number; y: number };

export type FamilyLayout = {
  /** Top-left of each person's real card. */
  positions: Map<string, Point>;
  /** Top-left of each reference card, by ref node id. */
  refPositions: Map<string, Point>;
  /** Generation rows that have someone in them, top to bottom. */
  rows: { generation: number; y: number }[];
  model: FamilyModel;
};

type LayoutPerson = Pick<PersonInput, "id" | "father_id" | "mother_id" | "gender" | "birth_date" | "given_en" | "given_ar">;
type LayoutRel = Pick<RelationshipInput, "id" | "person_a_id" | "person_b_id" | "type" | "status" | "order_index">;

const STEP = NODE_WIDTH + PARTNER_GAP;
export const ROW_HEIGHT = NODE_HEIGHT + ROW_GAP;
const slotKey = (s: Slot) => (s.kind === "person" ? s.personId : s.refId);
const clusterWidth = (c: Cluster) => c.slots.length * NODE_WIDTH + (c.slots.length - 1) * PARTNER_GAP;

/** y of a generation row. */
export const rowY = (generation: number) => generation * ROW_HEIGHT;

export function layoutFamily(
  people: LayoutPerson[],
  relationships: LayoutRel[],
  model: FamilyModel = buildFamilyModel(people, relationships),
): FamilyLayout {
  const byId = new Map(model.clusters.map((c) => [c.id, c]));
  const slotIndex = new Map<string, Map<string, number>>();
  for (const c of model.clusters) slotIndex.set(c.id, new Map(c.slots.map((s, i) => [slotKey(s), i])));

  // Children groups per cluster, in left-to-right order of their couple line.
  type Group = { mid: number; children: string[] };
  const groupsOf = new Map<string, Group[]>();
  for (const [unionId, at] of model.drawnAt) {
    const u = model.unions.get(unionId)!;
    if (u.childIds.length === 0 || !at.clusterId) continue;
    const idx = slotIndex.get(at.clusterId)!;
    const ia = idx.get(at.nodeA) ?? 0;
    const ib = at.nodeB ? idx.get(at.nodeB) ?? ia : ia;
    const mid = ((ia + ib) / 2) * STEP + NODE_WIDTH / 2;
    const children = u.childIds.map((id) => model.clusterOf.get(id)).filter((c): c is string => !!c && byId.has(c));
    const list = groupsOf.get(at.clusterId) ?? [];
    list.push({ mid, children });
    groupsOf.set(at.clusterId, list);
  }
  for (const list of groupsOf.values()) list.sort((a, b) => a.mid - b.mid);

  // The forest, breaking any cycle that bad data could create. A child cluster
  // must sit below its parent cluster's row to be part of its strip.
  const rowOf = (cid: string) => model.generation.get(byId.get(cid)!.coreId) ?? 0;
  const parentOf = new Map<string, string>();
  for (const [cid, groups] of groupsOf) for (const g of groups) for (const child of g.children) {
    if (child !== cid && !parentOf.has(child) && rowOf(child) > rowOf(cid)) parentOf.set(child, cid);
  }
  const kids = (cid: string) => (groupsOf.get(cid) ?? []).map((g) => ({ ...g, children: g.children.filter((c) => parentOf.get(c) === cid) }));
  const reached = new Set<string>();
  const treeOf = new Map<string, number>();
  const roots: string[] = [];
  const walk = (root: string, tree: number) => {
    const stack = [root];
    while (stack.length) {
      const cid = stack.pop()!;
      if (reached.has(cid)) continue;
      reached.add(cid);
      treeOf.set(cid, tree);
      for (const g of kids(cid)) stack.push(...g.children);
    }
  };
  const sortedClusters = model.clusters.map((c) => c.id).sort();
  for (const cid of sortedClusters) if (!parentOf.has(cid)) {
    roots.push(cid);
    walk(cid, roots.length - 1);
  }
  for (const cid of sortedClusters) if (!reached.has(cid)) {
    parentOf.delete(cid);
    roots.push(cid);
    walk(cid, roots.length - 1);
  }

  // Strip widths.
  const strip = new Map<string, number>();
  const blockOf = new Map<string, number>();
  const measure = (cid: string): number => {
    const cached = strip.get(cid);
    if (cached != null) return cached;
    let block = 0;
    kids(cid).filter((g) => g.children.length > 0).forEach((g, gi) => {
      if (gi > 0) block += GROUP_GAP;
      g.children.forEach((c, ci) => {
        block += (ci > 0 ? SIBLING_GAP : 0) + measure(c);
      });
    });
    blockOf.set(cid, block);
    const w = Math.max(clusterWidth(byId.get(cid)!), block);
    strip.set(cid, w);
    return w;
  };

  // Root order: biggest family first, lone people last.
  const size = new Map<number, number>();
  for (const [, t] of treeOf) size.set(t, (size.get(t) ?? 0) + 1);
  const rootOrder = roots
    .map((cid, i) => ({ cid, size: size.get(i) ?? 1, slots: byId.get(cid)!.slots.length }))
    .sort((a, b) => b.size - a.size || b.slots - a.slots || (a.cid < b.cid ? -1 : 1));

  const positions = new Map<string, Point>();
  const refPositions = new Map<string, Point>();
  const place = (cid: string, left: number) => {
    const c = byId.get(cid)!;
    const sw = measure(cid);
    const w = clusterWidth(c);
    const block = blockOf.get(cid) ?? 0;
    const groups = kids(cid).filter((g) => g.children.length > 0);

    // Centre of each children group, relative to the start of the block.
    const centres: number[] = [];
    let cursor = 0;
    groups.forEach((g, gi) => {
      if (gi > 0) cursor += GROUP_GAP;
      const start = cursor;
      g.children.forEach((ch, ci) => {
        cursor += (ci > 0 ? SIBLING_GAP : 0) + measure(ch);
      });
      centres.push((start + cursor) / 2);
    });

    let clusterLeft = left + (sw - w) / 2;
    let blockLeft = left + (sw - block) / 2;
    if (groups.length > 0) {
      const avgCentre = centres.reduce((a, b) => a + b, 0) / centres.length;
      const avgMid = groups.reduce((a, g) => a + g.mid, 0) / groups.length;
      if (block >= w) {
        blockLeft = left;
        clusterLeft = Math.min(Math.max(left + avgCentre - avgMid, left), left + sw - w);
      } else {
        clusterLeft = left;
        blockLeft = Math.min(Math.max(left + avgMid - avgCentre, left), left + sw - block);
      }
    }

    const y = rowY(rowOf(cid));
    c.slots.forEach((s, i) => {
      const p = { x: clusterLeft + i * STEP, y };
      if (s.kind === "person") positions.set(s.personId, p);
      else refPositions.set(s.refId, p);
    });

    let x = blockLeft;
    groups.forEach((g, gi) => {
      if (gi > 0) x += GROUP_GAP;
      g.children.forEach((ch, ci) => {
        if (ci > 0) x += SIBLING_GAP;
        place(ch, x);
        x += measure(ch);
      });
    });
  };

  let x = 0;
  for (const r of rootOrder) {
    place(r.cid, x);
    x += measure(r.cid) + GROUP_GAP;
  }

  const gens = [...new Set(model.clusters.map((c) => rowOf(c.id)))].sort((a, b) => a - b);
  return { positions, refPositions, rows: gens.map((g) => ({ generation: g, y: rowY(g) })), model };
}

/**
 * A manual horizontal nudge stored on a person: pos_x holds the offset and
 * pos_y is empty. Rows with pos_y set are older absolute positions and are not
 * offsets.
 */
export function manualOffset(p: Pick<PersonInput, "pos_x" | "pos_y">): number | null {
  return p.pos_x != null && p.pos_y == null && Number.isFinite(p.pos_x) ? p.pos_x : null;
}

/**
 * A card was dropped at `droppedX`: the offset to save, and on whom. The whole
 * cluster (the couple and their reference cards) moves together, so the offset
 * is measured from the cluster's automatic position and stored on its first
 * person, which is the member resolvePositions reads first.
 */
export function nudgeFor(
  personId: string,
  droppedX: number,
  people: LayoutPerson[],
  relationships: LayoutRel[],
  model: FamilyModel = buildFamilyModel(people, relationships),
): { personId: string; offset: number } | null {
  const cluster = model.clusters.find((c) => c.id === model.clusterOf.get(personId));
  if (!cluster) return null;
  const auto = layoutFamily(people, relationships, model);
  const first = cluster.slots[0];
  const autoLeft = first.kind === "person" ? auto.positions.get(first.personId)?.x : auto.refPositions.get(first.refId)?.x;
  const index = cluster.slots.findIndex((s) => s.kind === "person" && s.personId === personId);
  const owner = cluster.slots.find((s) => s.kind === "person");
  if (autoLeft == null || index < 0 || !owner || owner.kind !== "person") return null;
  return { personId: owner.personId, offset: Math.round(droppedX - index * STEP - autoLeft) };
}

/** Other people who move with this person when their card is dragged (same cluster). */
export function clusterMates(personId: string, model: FamilyModel): string[] {
  const cluster = model.clusters.find((c) => c.id === model.clusterOf.get(personId));
  return cluster ? cluster.slots.flatMap((s) => (s.kind === "person" && s.personId !== personId ? [s.personId] : [])) : [];
}

/**
 * Final positions: the automatic layout, plus each cluster's manual offset
 * (taken from the first member that has one), then a sweep per row that keeps
 * clusters in order and at least SIBLING_GAP apart, so nothing can overlap and
 * a couple can never be split by someone else's card.
 */
export function resolvePositions(
  people: (LayoutPerson & Pick<PersonInput, "pos_x" | "pos_y">)[],
  relationships: LayoutRel[],
  model: FamilyModel = buildFamilyModel(people, relationships),
): { positions: Map<string, Point>; refPositions: Map<string, Point>; rows: FamilyLayout["rows"] } {
  const layout = layoutFamily(people, relationships, model);
  const offsetOf = new Map(people.map((p) => [p.id, manualOffset(p)]));
  const positions = new Map(layout.positions);
  const refPositions = new Map(layout.refPositions);

  type Block = { cluster: Cluster; left: number; right: number; y: number; order: number };
  const blocks: Block[] = [];
  for (const c of model.clusters) {
    const pts = c.slots.map((s) => (s.kind === "person" ? positions.get(s.personId) : refPositions.get(s.refId))).filter((p): p is Point => !!p);
    if (pts.length === 0) continue;
    const off = c.slots.map((s) => (s.kind === "person" ? offsetOf.get(s.personId) : null)).find((o) => o != null) ?? 0;
    const left = Math.min(...pts.map((p) => p.x));
    blocks.push({ cluster: c, left: left + off, right: left + off + clusterWidth(c), y: pts[0].y, order: left });
  }

  const byRow = new Map<number, Block[]>();
  for (const b of blocks) byRow.set(b.y, [...(byRow.get(b.y) ?? []), b]);
  for (const row of byRow.values()) {
    // Keep the automatic order when a nudge would make two blocks swap places.
    row.sort((a, b) => a.left - b.left || a.order - b.order);
    let edge = -Infinity;
    for (const b of row) {
      const shift = Math.max(0, edge + SIBLING_GAP - b.left);
      b.left += shift;
      b.right += shift;
      edge = b.right;
    }
  }

  for (const b of blocks) {
    b.cluster.slots.forEach((s, i) => {
      const p = { x: b.left + i * STEP, y: b.y };
      if (s.kind === "person") positions.set(s.personId, p);
      else refPositions.set(s.refId, p);
    });
  }
  return { positions, refPositions, rows: layout.rows };
}
