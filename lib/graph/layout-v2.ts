import * as dagre from "@dagrejs/dagre";
import type {
  PersonInput,
  RelationshipInput,
  SpouseStatus,
} from "./transform";

/**
 * Auto-layout v2 — Sugiyama-style hierarchical layout with couple-compounding
 * pre-pass and virtual midpoint nodes for two-parent children.
 *
 * Pure function. No I/O. See docs/auto-layout-v2-design.md.
 */

export type LayoutV2Options = {
  nodeWidth?: number;
  nodeHeight?: number;
  nodesep?: number;
  ranksep?: number;
  coupleGap?: number;
  edgesep?: number;
  /** Person ids whose positions must NOT be touched (manual pins). */
  pinned?: ReadonlySet<string>;
  /** RTL flag — when 'ar', reverse couple member ordering. */
  lang?: "en" | "ar";
};

export type LayoutV2Couple = {
  leftId: string;
  rightId: string;
  status: SpouseStatus;
};

export type LayoutV2Result = {
  positions: Map<string, { x: number; y: number }>;
  /** Midpoint coordinates per child id — consumed by edge router. */
  midpoints: Map<string, { x: number; y: number }>;
  /** Couple-unit memberships, for the custom couple edge component. */
  couples: LayoutV2Couple[];
};

const DEFAULTS = {
  nodeWidth: 220,
  nodeHeight: 240,
  nodesep: 80,
  ranksep: 180,
  coupleGap: 24,
  edgesep: 24,
} as const;

type DagreNodeOut = { x: number; y: number; width: number; height: number };

export function autoLayoutV2(
  people: PersonInput[],
  relationships: RelationshipInput[],
  options: LayoutV2Options = {},
): LayoutV2Result {
  const nodeWidth = options.nodeWidth ?? DEFAULTS.nodeWidth;
  const nodeHeight = options.nodeHeight ?? DEFAULTS.nodeHeight;
  const nodesep = options.nodesep ?? DEFAULTS.nodesep;
  const ranksep = options.ranksep ?? DEFAULTS.ranksep;
  const coupleGap = options.coupleGap ?? DEFAULTS.coupleGap;
  const edgesep = options.edgesep ?? DEFAULTS.edgesep;
  const isRtl = options.lang === "ar";

  const idSet = new Set(people.map((p) => p.id));
  const personById = new Map(people.map((p) => [p.id, p]));

  // ---------------------------------------------------------------------------
  // 1. CLASSIFY: build spouse maps for "current" couples (compound) and all
  //    spouse relationships (for couples[] output).
  // ---------------------------------------------------------------------------
  const spouseRels = relationships.filter(
    (r) =>
      r.type === "spouse" &&
      idSet.has(r.person_a_id) &&
      idSet.has(r.person_b_id),
  );

  // Order: current first; then group by person to enforce "current closest,
  // exes pushed outward" rule (decision: overrides design doc's "by date").
  const currentRels = spouseRels
    .filter((r) => r.status === "current")
    .sort((a, b) => a.order_index - b.order_index);

  // ---------------------------------------------------------------------------
  // 2. COMPOUND: pair up current couples into couple-units.
  // ---------------------------------------------------------------------------
  type Unit = {
    id: string;
    members: string[]; // ordered left -> right for layout
    width: number;
    isCouple: boolean;
    relId?: string;
    status?: SpouseStatus;
  };

  const used = new Set<string>();
  const units: Unit[] = [];
  const unitByPerson = new Map<string, string>();
  const couples: LayoutV2Couple[] = [];

  for (const r of currentRels) {
    if (used.has(r.person_a_id) || used.has(r.person_b_id)) continue;
    const members = isRtl
      ? [r.person_b_id, r.person_a_id]
      : [r.person_a_id, r.person_b_id];
    const unitId = `cu:${r.id}`;
    units.push({
      id: unitId,
      members,
      width: 2 * nodeWidth + coupleGap,
      isCouple: true,
      relId: r.id,
      status: "current",
    });
    unitByPerson.set(members[0], unitId);
    unitByPerson.set(members[1], unitId);
    used.add(r.person_a_id);
    used.add(r.person_b_id);
    couples.push({ leftId: members[0], rightId: members[1], status: "current" });
  }

  for (const p of people) {
    if (used.has(p.id)) continue;
    // Singleton: unit id IS the person id so child-edges target it directly.
    const unitId = p.id;
    units.push({
      id: unitId,
      members: [p.id],
      width: nodeWidth,
      isCouple: false,
    });
    unitByPerson.set(p.id, unitId);
  }

  // Record divorced/widowed couples for edge-render purposes (NOT compounded).
  for (const r of spouseRels) {
    if (r.status === "current") continue;
    couples.push({
      leftId: r.person_a_id,
      rightId: r.person_b_id,
      status: r.status,
    });
  }

  const unitOf = (personId: string): string => {
    const u = unitByPerson.get(personId);
    if (!u) throw new Error(`No unit for person ${personId}`);
    return u;
  };

  // ---------------------------------------------------------------------------
  // 3. INSERT VIRTUAL MIDPOINTS for two-parent children whose parents are
  //    NOT in the same compounded couple-unit.
  // ---------------------------------------------------------------------------
  type Edge = {
    source: string;
    target: string;
    kind: "parent" | "midpoint" | "midpoint-drop";
  };
  const edges: Edge[] = [];
  type VirtualMid = { id: string; childId: string };
  const virtualMids: VirtualMid[] = [];

  for (const c of people) {
    const fid = c.father_id;
    const mid = c.mother_id;
    const fOk = fid && idSet.has(fid);
    const mOk = mid && idSet.has(mid);

    // Route edges to child's UNIT (so couple-children are positioned via
    // their couple-unit's box), unless child is a singleton in which case
    // unitOf(child) === child.id and the edge targets the person directly.
    const childTarget = unitOf(c.id);
    if (fOk && mOk) {
      const uF = unitOf(fid);
      const uM = unitOf(mid);
      if (uF === uM) {
        // Parents are a compounded couple: single edge from CU to child.
        edges.push({ source: uF, target: childTarget, kind: "parent" });
      } else {
        // Two-parent child whose parents are NOT a compounded couple.
        // Emit two direct parent→child edges (Dagre balances the child's
        // x to the midpoint of its two equal-weight parents) and record
        // a virtual-midpoint placeholder for the edge router.
        virtualMids.push({ id: `mid:${c.id}`, childId: c.id });
        edges.push({ source: uF, target: childTarget, kind: "parent" });
        edges.push({ source: uM, target: childTarget, kind: "parent" });
      }
    } else if (fOk && fid) {
      edges.push({ source: unitOf(fid), target: childTarget, kind: "parent" });
    } else if (mOk && mid) {
      edges.push({ source: unitOf(mid), target: childTarget, kind: "parent" });
    }
  }

  // ---------------------------------------------------------------------------
  // 4-5. DAGRE LAYOUT — CUs are single wide nodes, singletons are single
  //    nodes, virtual midpoints are tiny (width=1) routing anchors. Children
  //    are also their own nodes (the target of midpoint-drop / parent edges).
  //
  //    We need to add an entry per person for the singleton case, AND per
  //    child target. Because child targets and singleton-units share the
  //    same person id namespace (`p:` prefix for unit), we keep them
  //    distinct: layout id = unit id for parent nodes; raw person id for
  //    target-of-child-edge nodes. To avoid confusion, EVERY person is laid
  //    out under its unit id; if a person is a singleton, that unit is just
  //    the person itself. We then need to ensure edges target the person's
  //    *unit* when the person is a "child" — but child positions need to be
  //    the person's coords, not the unit's box. For singletons, those are
  //    identical (one person per unit). For couple-units, a child of one of
  //    the parents (where the other parent is unknown/external) targets the
  //    couple-unit and lands centered under the CU, which is acceptable for
  //    v2.0 (rare case; design doc accepts).
  // ---------------------------------------------------------------------------
  const g = new dagre.graphlib.Graph({ multigraph: false, compound: false });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep,
    ranksep,
    edgesep,
    marginx: 20,
    marginy: 20,
  });

  // Unit nodes (parents and singletons)
  for (const u of units) {
    g.setNode(u.id, { width: u.width, height: nodeHeight });
  }
  // Virtual midpoints are NOT real Dagre nodes anymore; they're computed
  // post-layout from the two parent positions and used only as edge-routing
  // anchors. See `midpoints` map below.
  // No additional child-target nodes needed: edges target the child's
  // unit, which is already in the graph (singleton unit id == person id,
  // couple unit id == `cu:<rel>`).

  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  // ---------------------------------------------------------------------------
  // 6. EXPAND: split couple-units into the two member persons.
  // ---------------------------------------------------------------------------
  const positions = new Map<string, { x: number; y: number }>();

  const readNode = (id: string): DagreNodeOut | undefined => {
    const n = g.node(id) as DagreNodeOut | undefined;
    if (!n) return undefined;
    return n;
  };

  for (const u of units) {
    const n = readNode(u.id);
    if (!n) continue;
    if (u.isCouple) {
      const [leftId, rightId] = u.members;
      // CU center is n.x. Left member centered at n.x - (W+gap)/2,
      // right at n.x + (W+gap)/2. Convert center → top-left position.
      const leftCenterX = n.x - (nodeWidth + coupleGap) / 2;
      const rightCenterX = n.x + (nodeWidth + coupleGap) / 2;
      positions.set(leftId, {
        x: leftCenterX - nodeWidth / 2,
        y: n.y - nodeHeight / 2,
      });
      positions.set(rightId, {
        x: rightCenterX - nodeWidth / 2,
        y: n.y - nodeHeight / 2,
      });
    } else {
      const personId = u.members[0];
      positions.set(personId, {
        x: n.x - nodeWidth / 2,
        y: n.y - nodeHeight / 2,
      });
    }
  }

  // Catch-all: ensure every person has a position.
  for (const p of people) {
    if (positions.has(p.id)) continue;
    const n = readNode(p.id);
    if (n) {
      positions.set(p.id, {
        x: n.x - nodeWidth / 2,
        y: n.y - nodeHeight / 2,
      });
    } else {
      positions.set(p.id, { x: 0, y: 0 });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. MIDPOINTS for edge routing — read virtual midpoint coords; for
  //    couple-parent children, compute midpoint between the couple members.
  // ---------------------------------------------------------------------------
  const midpoints = new Map<string, { x: number; y: number }>();

  for (const v of virtualMids) {
    const c = personById.get(v.childId);
    if (!c || !c.father_id || !c.mother_id) continue;
    const pf = positions.get(c.father_id);
    const pm = positions.get(c.mother_id);
    const cp = positions.get(v.childId);
    if (!pf || !pm || !cp) continue;
    midpoints.set(v.childId, {
      x: (pf.x + pm.x) / 2 + nodeWidth / 2,
      y: (Math.max(pf.y, pm.y) + cp.y) / 2 + nodeHeight / 2,
    });
  }

  // For two-parent children whose parents form a compounded couple:
  // midpoint = midpoint between the two parent member positions.
  for (const c of people) {
    if (midpoints.has(c.id)) continue;
    const fid = c.father_id;
    const mid = c.mother_id;
    if (!fid || !mid) continue;
    if (!idSet.has(fid) || !idSet.has(mid)) continue;
    if (unitOf(fid) !== unitOf(mid)) continue;
    const pf = positions.get(fid);
    const pm = positions.get(mid);
    if (!pf || !pm) continue;
    midpoints.set(c.id, {
      x: (pf.x + pm.x) / 2 + nodeWidth / 2,
      y: (pf.y + pm.y) / 2 + nodeHeight / 2,
    });
  }

  void personById;

  return { positions, midpoints, couples };
}
