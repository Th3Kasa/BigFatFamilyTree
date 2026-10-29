/**
 * Family units: the model the tree layout, the edges and the Family view share.
 *
 * A **union** is one couple (from a spouse relationship, or two people recorded
 * as a child's father and mother) or a single parent whose children have no
 * other recorded parent. Every child belongs to exactly one union: the one that
 * matches its (father_id, mother_id).
 *
 * Placement rules (each person appears once as a full card):
 *  1. **Born into the tree.** Anyone with a parent in the tree ("anchored") sits
 *     in their birth family. They are the *core* of their own row cluster.
 *  2. **Married in.** Someone with no parents in the tree sits beside a partner:
 *     an anchored partner if they have one (their earliest marriage by
 *     `order_index`, then relationship id), otherwise they join a cluster of
 *     other married-in people (chained through their marriages).
 *  3. **Two places at once.** When a union's partners sit in different places
 *     (an in-family marriage, or a married-in person's later marriage), the union
 *     is drawn at the **host** partner, and the other partner appears there as a
 *     dashed *reference card* that links back to their real card. The host is:
 *     the anchored partner if exactly one is anchored; otherwise the husband
 *     (gender "m") if exactly one partner is male; otherwise the partner with the
 *     smaller id. Deterministic, so the tree never reshuffles between visits.
 *  4. **Order within a cluster.** Partners sit on both sides of the person they
 *     married: current marriages to the right, earlier/past marriages to the
 *     left (earliest furthest out). A married-in partner's own other marriages
 *     chain further out on the same side. Physical sides do not flip in Arabic,
 *     so the tree reads the same for everyone.
 *  5. **Generations.** Ancestors with no parents in the tree are generation 0;
 *     everyone else is one more than their deeper parent. A married-in partner
 *     takes the generation of the person they sit beside, and a reference card
 *     sits in its host's row, so couples always share a row.
 *
 * Pure: no React, no DOM. Unit tested in units.test.ts and layout.test.ts.
 */

import type { PersonInput, RelationshipInput } from "./transform";

export type UnionStatus = "current" | "divorced" | "widowed";

export type Union = {
  /** "u:<a>|<b>" with ids sorted, or "u:<parent>|" for a single parent. */
  id: string;
  a: string;
  b: string | null;
  /** Spouse relationship rows for this pair, oldest first. Empty when implicit. */
  relationshipIds: string[];
  /** Status of the latest row (or "current" for an implicit couple). */
  status: UnionStatus;
  orderIndex: number;
  /** Co-parents with no spouse relationship recorded. */
  implicit: boolean;
  /** The union's children, oldest first. */
  childIds: string[];
  fatherId: string | null;
  motherId: string | null;
};

export type Slot =
  | { kind: "person"; personId: string }
  | { kind: "ref"; personId: string; unionId: string; hostId: string; refId: string };

export type Cluster = {
  id: string;
  coreId: string;
  /** Cards in this row cluster, left to right. */
  slots: Slot[];
  /** Union drawn in this cluster that the core was born into (null for a root). */
  parentUnionId: string | null;
};

export type FamilyModel = {
  unions: Map<string, Union>;
  /** Person id → their unions (with a partner), ordered by marriage order. */
  unionsOf: Map<string, Union[]>;
  /** Person id → single-parent union (children with no other recorded parent). */
  soloUnionOf: Map<string, Union>;
  /** Child id → the union they were born into. */
  birthUnionOf: Map<string, string>;
  clusters: Cluster[];
  /** Person id → cluster id where their real card sits. */
  clusterOf: Map<string, string>;
  /** Union id → where it is drawn: the two card ids (person or ref) and the cluster. */
  drawnAt: Map<string, { clusterId: string; nodeA: string; nodeB: string | null }>;
  refs: Extract<Slot, { kind: "ref" }>[];
  anchored: Set<string>;
  /** Married-in person → the partner they sit beside. */
  attachTo: Map<string, { partnerId: string; unionId: string }>;
  /**
   * Generation of every person: 0 for ancestors with no parents in the tree,
   * max(parents) + 1 for everyone else, and a married-in partner shares the
   * generation of the person they sit beside.
   */
  generation: Map<string, number>;
};

type P = Pick<PersonInput, "id" | "father_id" | "mother_id" | "gender" | "birth_date" | "given_en" | "given_ar">;
type R = Pick<RelationshipInput, "id" | "person_a_id" | "person_b_id" | "type" | "status" | "order_index">;

const pairKey = (a: string, b: string | null) => (b == null ? `u:${a}|` : a < b ? `u:${a}|${b}` : `u:${b}|${a}`);
export const refNodeId = (unionId: string, personId: string) => `ref:${unionId}:${personId}`;

const STATUS_RANK: Record<UnionStatus, number> = { divorced: 0, widowed: 0, current: 1 };

/** Marriage order: order_index, then past before current, then id. */
export function compareUnions(x: Union, y: Union): number {
  return x.orderIndex - y.orderIndex || STATUS_RANK[x.status] - STATUS_RANK[y.status] || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}

/** Oldest first; unknown birth dates last; then by name and id for stability. */
export function compareByBirth(a: P, b: P): number {
  const ab = a.birth_date ?? "9999";
  const bb = b.birth_date ?? "9999";
  if (ab !== bb) return ab < bb ? -1 : 1;
  const an = a.given_en ?? a.given_ar ?? "";
  const bn = b.given_en ?? b.given_ar ?? "";
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildUnions(people: P[], relationships: R[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const unions = new Map<string, Union>();

  const rows = relationships
    .filter((r) => r.type === "spouse" && r.person_a_id !== r.person_b_id && byId.has(r.person_a_id) && byId.has(r.person_b_id))
    .sort((x, y) => (x.order_index ?? 0) - (y.order_index ?? 0) || (x.id < y.id ? -1 : 1));
  for (const r of rows) {
    const id = pairKey(r.person_a_id, r.person_b_id);
    const existing = unions.get(id);
    if (existing) {
      existing.relationshipIds.push(r.id);
      existing.status = r.status;
      existing.orderIndex = r.order_index ?? existing.orderIndex;
    } else {
      const [a, b] = r.person_a_id < r.person_b_id ? [r.person_a_id, r.person_b_id] : [r.person_b_id, r.person_a_id];
      unions.set(id, {
        id, a, b, relationshipIds: [r.id], status: r.status, orderIndex: r.order_index ?? 0,
        implicit: false, childIds: [], fatherId: null, motherId: null,
      });
    }
  }

  const birthUnionOf = new Map<string, string>();
  const sorted = [...people].sort(compareByBirth);
  for (const child of sorted) {
    const fid = child.father_id && byId.has(child.father_id) && child.father_id !== child.id ? child.father_id : null;
    const mid = child.mother_id && byId.has(child.mother_id) && child.mother_id !== child.id ? child.mother_id : null;
    if (!fid && !mid) continue;
    const solo = !fid || !mid || fid === mid;
    const id = solo ? pairKey((fid ?? mid)!, null) : pairKey(fid!, mid!);
    let u = unions.get(id);
    if (!u) {
      const [a, b] = solo ? [(fid ?? mid)!, null] : fid! < mid! ? [fid!, mid!] : [mid!, fid!];
      u = { id, a, b, relationshipIds: [], status: "current", orderIndex: Number.MAX_SAFE_INTEGER, implicit: !solo, childIds: [], fatherId: null, motherId: null };
      unions.set(id, u);
    }
    u.fatherId = fid;
    u.motherId = mid;
    u.childIds.push(child.id);
    birthUnionOf.set(child.id, id);
  }

  const unionsOf = new Map<string, Union[]>();
  const soloUnionOf = new Map<string, Union>();
  for (const u of unions.values()) {
    if (u.b == null) {
      soloUnionOf.set(u.a, u);
      continue;
    }
    for (const pid of [u.a, u.b]) {
      const list = unionsOf.get(pid);
      if (list) list.push(u);
      else unionsOf.set(pid, [u]);
    }
  }
  // Implicit couples have no order of their own: put them after recorded marriages.
  for (const list of unionsOf.values()) list.sort(compareUnions);

  return { unions, unionsOf, soloUnionOf, birthUnionOf };
}

/** 1-based marriage number of `union` among `personId`'s recorded marriages (null when implicit). */
export function marriageOrdinal(model: Pick<FamilyModel, "unionsOf">, personId: string, unionId: string): number | null {
  const list = (model.unionsOf.get(personId) ?? []).filter((u) => !u.implicit);
  const i = list.findIndex((u) => u.id === unionId);
  return i < 0 ? null : i + 1;
}

export function buildFamilyModel(people: P[], relationships: R[]): FamilyModel {
  const byId = new Map(people.map((p) => [p.id, p]));
  const { unions, unionsOf, soloUnionOf, birthUnionOf } = buildUnions(people, relationships);
  const anchored = new Set(people.filter((p) => birthUnionOf.has(p.id)).map((p) => p.id));
  const partnerOf = (u: Union, pid: string) => (u.a === pid ? u.b! : u.a);

  // ── Rule 2: who each married-in person sits beside ────────────────────────
  const attachTo = new Map<string, { partnerId: string; unionId: string }>();
  const floating = people.filter((p) => !anchored.has(p.id)).map((p) => p.id).sort();
  for (const pid of floating) {
    const toAnchored = (unionsOf.get(pid) ?? []).find((u) => anchored.has(partnerOf(u, pid)));
    if (toAnchored) attachTo.set(pid, { partnerId: partnerOf(toAnchored, pid), unionId: toAnchored.id });
  }
  // Married-in people linked only to other married-in people: BFS from those
  // already seated (or, failing that, from one deterministic core per group).
  const visited = new Set<string>([...anchored, ...attachTo.keys()]);
  const bfs = (starts: string[]) => {
    const queue = [...starts];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const u of unionsOf.get(cur) ?? []) {
        const other = partnerOf(u, cur);
        if (visited.has(other)) continue;
        visited.add(other);
        attachTo.set(other, { partnerId: cur, unionId: u.id });
        queue.push(other);
      }
    }
  };
  bfs([...attachTo.keys()].sort());
  const roots: string[] = [];
  for (const pid of floating) {
    if (visited.has(pid)) continue;
    // Pick this group's core: most marriages, then male, then smallest id.
    const group: string[] = [];
    const stack = [pid];
    const seen = new Set([pid]);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const u of unionsOf.get(cur) ?? []) {
        const o = partnerOf(u, cur);
        if (!seen.has(o) && !visited.has(o)) {
          seen.add(o);
          stack.push(o);
        }
      }
    }
    group.sort((x, y) => {
      const dx = (unionsOf.get(y)?.length ?? 0) - (unionsOf.get(x)?.length ?? 0);
      if (dx) return dx;
      const gx = byId.get(x)?.gender === "m" ? 0 : 1;
      const gy = byId.get(y)?.gender === "m" ? 0 : 1;
      return gx - gy || (x < y ? -1 : 1);
    });
    const core = group[0];
    visited.add(core);
    roots.push(core);
    bfs([core]);
  }

  // ── Rule 3: where each union is drawn ─────────────────────────────────────
  const attachedVia = (u: Union) =>
    (attachTo.get(u.a)?.unionId === u.id && attachTo.get(u.a)?.partnerId === u.b) ||
    (attachTo.get(u.b!)?.unionId === u.id && attachTo.get(u.b!)?.partnerId === u.a);
  const hostOf = (u: Union): string => {
    const aA = anchored.has(u.a);
    const bA = anchored.has(u.b!);
    if (aA !== bA) return aA ? u.a : u.b!;
    const aM = byId.get(u.a)?.gender === "m";
    const bM = byId.get(u.b!)?.gender === "m";
    if (aM !== bM) return aM ? u.a : u.b!;
    return u.a < u.b! ? u.a : u.b!;
  };

  // Partner "slots" that hang off each person: attached partners and refs.
  type Hang = { union: Union; slot: Slot };
  const hangs = new Map<string, Hang[]>();
  const addHang = (pid: string, h: Hang) => {
    const list = hangs.get(pid);
    if (list) list.push(h);
    else hangs.set(pid, [h]);
  };
  const refs: Extract<Slot, { kind: "ref" }>[] = [];
  for (const [pid, { partnerId, unionId }] of attachTo) {
    addHang(partnerId, { union: unions.get(unionId)!, slot: { kind: "person", personId: pid } });
  }
  const remote = new Map<string, { host: string; guest: string }>();
  for (const u of unions.values()) {
    if (u.b == null || attachedVia(u)) continue;
    const host = hostOf(u);
    const guest = partnerOf(u, host);
    const ref = { kind: "ref" as const, personId: guest, unionId: u.id, hostId: host, refId: refNodeId(u.id, guest) };
    refs.push(ref);
    remote.set(u.id, { host, guest });
    addHang(host, { union: u, slot: ref });
  }

  // ── Rule 4: arrange each cluster left to right ────────────────────────────
  const arrange = (pid: string, side: "left" | "right" | null, guard: Set<string>): Slot[] => {
    guard.add(pid);
    const mine = (hangs.get(pid) ?? [])
      .filter((h) => h.slot.kind === "ref" || !guard.has(h.slot.personId))
      .sort((x, y) => compareUnions(x.union, y.union));
    const expand = (h: Hang, s: "left" | "right"): Slot[] =>
      h.slot.kind === "ref" ? [h.slot] : arrange(h.slot.personId, s, guard);
    const self: Slot = { kind: "person", personId: pid };
    if (side === "left") return [...mine.flatMap((h) => expand(h, "left")), self];
    if (side === "right") return [self, ...mine.flatMap((h) => expand(h, "right"))];
    let right = mine.filter((h) => h.union.status === "current");
    if (right.length === 0 && mine.length > 0) right = [mine[mine.length - 1]];
    const left = mine.filter((h) => !right.includes(h));
    return [...left.flatMap((h) => expand(h, "left")), self, ...right.flatMap((h) => expand(h, "right"))];
  };

  const clusters: Cluster[] = [];
  const clusterOf = new Map<string, string>();
  const cores = [...people.filter((p) => anchored.has(p.id)).map((p) => p.id), ...roots];
  for (const core of cores) {
    const id = `c:${core}`;
    const slots = arrange(core, null, new Set());
    for (const s of slots) if (s.kind === "person") clusterOf.set(s.personId, id);
    clusters.push({ id, coreId: core, slots, parentUnionId: birthUnionOf.get(core) ?? null });
  }

  const drawnAt = new Map<string, { clusterId: string; nodeA: string; nodeB: string | null }>();
  for (const u of unions.values()) {
    if (u.b == null) {
      drawnAt.set(u.id, { clusterId: clusterOf.get(u.a)!, nodeA: u.a, nodeB: null });
      continue;
    }
    const r = remote.get(u.id);
    if (r) drawnAt.set(u.id, { clusterId: clusterOf.get(r.host)!, nodeA: r.host, nodeB: refNodeId(u.id, r.guest) });
    else drawnAt.set(u.id, { clusterId: clusterOf.get(u.a)!, nodeA: u.a, nodeB: u.b });
  }

  // ── Generations (one row each, oldest at the top) ─────────────────────────
  const generation = new Map<string, number>();
  const visiting = new Set<string>();
  const genOf = (pid: string): number => {
    const known = generation.get(pid);
    if (known != null) return known;
    if (visiting.has(pid)) return 0; // a cycle in bad data: stop here
    visiting.add(pid);
    let g = 0;
    const birth = birthUnionOf.get(pid);
    if (birth) {
      const u = unions.get(birth)!;
      g = 1 + Math.max(...[u.fatherId, u.motherId].filter((x): x is string => !!x).map(genOf));
    } else if (attachTo.has(pid)) {
      g = genOf(attachTo.get(pid)!.partnerId);
    }
    visiting.delete(pid);
    generation.set(pid, g);
    return g;
  };
  for (const p of people) genOf(p.id);

  return { unions, unionsOf, soloUnionOf, birthUnionOf, clusters, clusterOf, drawnAt, refs, anchored, attachTo, generation };
}
