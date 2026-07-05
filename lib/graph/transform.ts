import type React from "react";
import * as dagre from "@dagrejs/dagre";
import type { Lang } from "@/lib/lang/server";
import { autoLayoutV2 } from "./layout-v2";
import { EDGE_STYLES } from "./edge-styles";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 240;

export type PersonInput = {
  id: string;
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  father_id: string | null;
  mother_id: string | null;
  gender: "m" | "f" | "unknown";
  is_placeholder: boolean;
  photo_url: string | null;
  pos_x: number | null;
  pos_y: number | null;
};

export type RelationshipInput = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  type: "spouse" | "adopted_by" | "raised_by" | "godparent";
  status: "current" | "divorced" | "widowed";
  order_index: number;
};

export type PersonNodeData = {
  person: PersonInput;
  spouseId?: string;
  lang: Lang;
  onQuickAdd?: (kind: "child" | "spouse") => void;
};

export type GraphNode = {
  id: string;
  type: "person";
  data: PersonNodeData;
  position: { x: number; y: number };
};

export type SpouseStatus = "current" | "divorced" | "widowed";

export type GraphEdgeType = "smoothstep" | "straight" | "step" | "family-branch" | "spouse";

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
  sourceHandle?: string;
  targetHandle?: string;
  selectable?: boolean;
  focusable?: boolean;
  deletable?: boolean;
  data?: {
    edgeKind: "parent" | "spouse" | "family-branch" | "adopted" | "guardian";
    relationshipId?: string;
    status?: SpouseStatus;
    fatherId?: string | null;
    motherId?: string | null;
    childIds?: string[];
    /** True when this spouse edge is a past relationship of a remarried person. */
    ghost?: boolean;
    /** Marriage order (relationships.order_index) — 1st, 2nd, … */
    orderIndex?: number;
    /** True when either spouse has more than one marriage, so the order badge is meaningful. */
    showOrder?: boolean;
  };
  style?: React.CSSProperties;
  animated?: boolean;
};

export type BuildGraphOptions = {
  layout?: "v1" | "v2";
};

export function buildGraphElements(
  people: PersonInput[],
  relationships: RelationshipInput[],
  lang: Lang,
  options: BuildGraphOptions = {},
): { nodes: GraphNode[]; edges: GraphEdge[]; midpoints?: Map<string, { x: number; y: number }> } {
  const layoutMode = options.layout ?? "v1";
  const idSet = new Set(people.map((p) => p.id));

  // Build spouse map for "add child" links. Prefer a current spouse;
  // fall back to first relationship if only ex-spouses exist.
  const spouseMap = new Map<string, string>();
  const spouseStatuses = new Map<string, string>();
  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    for (const [self, other] of [
      [r.person_a_id, r.person_b_id],
      [r.person_b_id, r.person_a_id],
    ] as const) {
      const currentBest = spouseStatuses.get(self);
      const incoming = r.status;
      if (
        !currentBest ||
        (currentBest !== "current" && incoming === "current")
      ) {
        spouseMap.set(self, other);
        spouseStatuses.set(self, incoming);
      }
    }
  }

  const nodes: GraphNode[] = people.map((p) => ({
    id: p.id,
    type: "person",
    data: { person: p, spouseId: spouseMap.get(p.id), lang },
    position: { x: p.pos_x ?? 0, y: p.pos_y ?? 0 },
  }));

  const edges: GraphEdge[] = [];

  // Group children by their parent pair (fatherId|motherId)
  // so we can render one T-junction bracket per family unit.
  const familyGroups = new Map<
    string,
    { fatherId: string | null; motherId: string | null; childIds: string[] }
  >();

  for (const p of people) {
    const fid = p.father_id && idSet.has(p.father_id) ? p.father_id : null;
    const mid = p.mother_id && idSet.has(p.mother_id) ? p.mother_id : null;
    if (!fid && !mid) continue;
    const key = `${fid ?? ""}|${mid ?? ""}`;
    if (!familyGroups.has(key)) {
      familyGroups.set(key, { fatherId: fid, motherId: mid, childIds: [] });
    }
    familyGroups.get(key)!.childIds.push(p.id);
  }

  for (const [key, { fatherId, motherId, childIds }] of familyGroups) {
    const sourceId = fatherId ?? motherId!;
    const targetId = childIds[0];
    edges.push({
      id: `fb-${key}`,
      source: sourceId,
      target: targetId,
      type: "family-branch",
      sourceHandle: "bottom",
      targetHandle: "top",
      selectable: false,
      focusable: false,
      deletable: false,
      data: {
        edgeKind: "family-branch",
        fatherId,
        motherId,
        childIds,
      },
    } as GraphEdge);
  }

  // Detect remarriage: a person who has a current spouse AND at least one
  // past (divorced/widowed) relationship. Past edges are flagged ghost so the
  // CoupleEdge renders them at reduced opacity.
  const hasCurrentSpouse = new Set<string>();
  const spouseCounts = new Map<string, number>();
  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (r.status === "current") {
      hasCurrentSpouse.add(r.person_a_id);
      hasCurrentSpouse.add(r.person_b_id);
    }
    spouseCounts.set(r.person_a_id, (spouseCounts.get(r.person_a_id) ?? 0) + 1);
    spouseCounts.set(r.person_b_id, (spouseCounts.get(r.person_b_id) ?? 0) + 1);
  }
  // Show the marriage-order badge only when it disambiguates something.
  const showOrderFor = (r: RelationshipInput) =>
    (spouseCounts.get(r.person_a_id) ?? 0) > 1 ||
    (spouseCounts.get(r.person_b_id) ?? 0) > 1;

  // ---- v2 layout branch ---------------------------------------------------
  // v2 is render-only: ignore pos_x/pos_y entirely, run autoLayoutV2,
  // overwrite all node positions, and return midpoints for edge routing.
  if (layoutMode === "v2") {
    const { positions, midpoints } = autoLayoutV2(people, relationships, {
      lang,
    });
    for (const n of nodes) {
      const pos = positions.get(n.id);
      if (pos) n.position = { x: pos.x, y: pos.y };
    }
    const posMapV2 = new Map(nodes.map((n) => [n.id, n.position]));
    for (const r of relationships) {
      if (r.type !== "spouse") continue;
      const posA = posMapV2.get(r.person_a_id);
      const posB = posMapV2.get(r.person_b_id);
      const aIsLeft = !posA || !posB || posA.x <= posB.x;
      const status = (r.status ?? "current") as SpouseStatus;
      const ghost =
        status !== "current" &&
        (hasCurrentSpouse.has(r.person_a_id) ||
          hasCurrentSpouse.has(r.person_b_id));
      edges.push({
        id: `s-${r.id}`,
        source: aIsLeft ? r.person_a_id : r.person_b_id,
        target: aIsLeft ? r.person_b_id : r.person_a_id,
        sourceHandle: "right",
        targetHandle: "left-target",
        type: "spouse",
        data: {
          edgeKind: "spouse",
          relationshipId: r.id,
          status,
          ghost,
          orderIndex: r.order_index,
          showOrder: showOrderFor(r),
        },
      });
    }
    return { nodes, edges, midpoints };
  }

  // Only nodes WITHOUT stored positions go through dagre
  const unpositioned = nodes.filter((n) => {
    const p = (n.data as PersonNodeData).person;
    return p.pos_x == null || p.pos_y == null;
  });

  if (unpositioned.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90, marginx: 20, marginy: 20 });
    unpositioned.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
    // Feed Dagre ALL children from every family group, not just the representative child.
    // This ensures siblings and children of remarriages are placed correctly.
    const unpositionedIds = new Set(unpositioned.map((n) => n.id));
    for (const e of edges) {
      if (e.data?.edgeKind !== "family-branch") continue;
      const fb = e.data as { fatherId: string | null; motherId: string | null; childIds: string[] };
      const sourceId = fb.fatherId ?? fb.motherId;
      if (!sourceId || !unpositionedIds.has(sourceId)) continue;
      for (const childId of fb.childIds) {
        if (unpositionedIds.has(childId)) g.setEdge(sourceId, childId);
      }
    }
    dagre.layout(g);
    unpositioned.forEach((n) => {
      const pos = g.node(n.id);
      if (pos) {
        n.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
      }
    });
  }

  // Build spouse, adoptive, and guardian edges after layout
  const posMap = new Map(nodes.map((n) => [n.id, n.position]));
  for (const r of relationships) {
    if (r.type === "spouse") {
      if (!idSet.has(r.person_a_id) || !idSet.has(r.person_b_id)) continue;
      const posA = posMap.get(r.person_a_id);
      const posB = posMap.get(r.person_b_id);
      const aIsLeft = !posA || !posB || posA.x <= posB.x;
      const status = (r.status ?? "current") as SpouseStatus;
      // SpouseEdge computes its own stroke from data.status — no style needed here
      const ghost =
        status !== "current" &&
        (hasCurrentSpouse.has(r.person_a_id) ||
          hasCurrentSpouse.has(r.person_b_id));
      edges.push({
        id: `s-${r.id}`,
        source: aIsLeft ? r.person_a_id : r.person_b_id,
        target: aIsLeft ? r.person_b_id : r.person_a_id,
        sourceHandle: "right",
        targetHandle: "left-target",
        type: "spouse",
        data: {
          edgeKind: "spouse",
          relationshipId: r.id,
          status,
          ghost,
          orderIndex: r.order_index,
          showOrder: showOrderFor(r),
        },
      });
    } else if (r.type === "adopted_by") {
      // person_a = adopted child, person_b = adoptive parent
      if (!idSet.has(r.person_a_id) || !idSet.has(r.person_b_id)) continue;
      edges.push({
        id: `adopt-${r.id}`,
        source: r.person_b_id,
        target: r.person_a_id,
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "straight",
        selectable: true,
        focusable: true,
        deletable: true,
        data: { edgeKind: "adopted", relationshipId: r.id },
        style: {
          stroke: EDGE_STYLES.adopted.stroke,
          strokeWidth: 2,
          strokeDasharray: EDGE_STYLES.adopted.dash,
        },
      } as GraphEdge);
    } else if (r.type === "raised_by") {
      // person_a = child being raised, person_b = guardian
      if (!idSet.has(r.person_a_id) || !idSet.has(r.person_b_id)) continue;
      edges.push({
        id: `guardian-${r.id}`,
        source: r.person_b_id,
        target: r.person_a_id,
        sourceHandle: "bottom",
        targetHandle: "top",
        type: "straight",
        selectable: true,
        focusable: true,
        deletable: true,
        data: { edgeKind: "guardian", relationshipId: r.id },
        style: {
          stroke: EDGE_STYLES.guardian.stroke,
          strokeWidth: 2,
          strokeDasharray: EDGE_STYLES.guardian.dash,
        },
      } as GraphEdge);
    }
  }

  return { nodes, edges };
}

export function autoLayoutPositions(
  people: PersonInput[],
  relationships: RelationshipInput[] = [],
): Map<string, { x: number; y: number }> {
  const idSet = new Set(people.map((p) => p.id));

  function hasParentInTree(personId: string): boolean {
    const p = people.find((x) => x.id === personId);
    return !!(p && ((p.father_id && idSet.has(p.father_id)) || (p.mother_id && idSet.has(p.mother_id))));
  }

  // Build pair groups for spouse Y-snap and X-align steps below.
  const pairGroups = new Map<string, { fid: string; mid: string; childIds: string[] }>();
  for (const p of people) {
    const fid = p.father_id && idSet.has(p.father_id) ? p.father_id : null;
    const mid = p.mother_id && idSet.has(p.mother_id) ? p.mother_id : null;
    if (!fid || !mid) continue;
    const key = `${fid}|${mid}`;
    if (!pairGroups.has(key)) pairGroups.set(key, { fid, mid, childIds: [] });
    pairGroups.get(key)!.childIds.push(p.id);
  }

  // ── 1. Build Dagre graph — no virtual couple nodes ────────────────────────
  // Virtual couple nodes add an extra rank when one parent is already deeper
  // in the tree (has their own parents), pushing grandchildren one level too
  // deep. Instead, route each child through a single "anchor" parent and
  // use Y/X alignment to place the other parent at the correct position.
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90, marginx: 40, marginy: 40 });

  people.forEach((p) => g.setNode(p.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

  for (const p of people) {
    const fid = p.father_id && idSet.has(p.father_id) ? p.father_id : null;
    const mid = p.mother_id && idSet.has(p.mother_id) ? p.mother_id : null;
    if (!fid && !mid) continue;

    // Prefer the parent who is already deeper in the tree (has parents of their
    // own). If both or neither qualify, default to father.
    let anchorId: string;
    if (fid && mid) {
      anchorId = (hasParentInTree(mid) && !hasParentInTree(fid)) ? mid : fid;
    } else {
      anchorId = fid ?? mid!;
    }
    g.setEdge(anchorId, p.id);
  }

  dagre.layout(g);

  // ── 2. Extract positions ──────────────────────────────────────────────────
  const out = new Map<string, { x: number; y: number }>();
  people.forEach((p) => {
    const pos = g.node(p.id);
    if (pos) out.set(p.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  });

  // ── 3. Y-snap spouses to the same row ────────────────────────────────────
  for (const [, { fid, mid }] of pairGroups) {
    const pA = out.get(fid);
    const pB = out.get(mid);
    if (pA && pB) {
      const alignY = Math.max(pA.y, pB.y);
      out.set(fid, { ...pA, y: alignY });
      out.set(mid, { ...pB, y: alignY });
    }
  }

  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (!idSet.has(r.person_a_id) || !idSet.has(r.person_b_id)) continue;
    const pA = out.get(r.person_a_id);
    const pB = out.get(r.person_b_id);
    if (pA && pB) {
      const alignY = Math.max(pA.y, pB.y);
      out.set(r.person_a_id, { ...pA, y: alignY });
      out.set(r.person_b_id, { ...pB, y: alignY });
    }
  }

  // ── 4. X-align floating spouses ───────────────────────────────────────────
  // A "floating" spouse has no parents in the tree, so Dagre places them at
  // rank 0 with an X position unrelated to their partner. After Y-snap their
  // Y is correct; fix X by placing them immediately to the RIGHT of the
  // anchored partner (consistent visual convention regardless of gender).
  const SPOUSE_GAP = 60;

  for (const [, { fid, mid }] of pairGroups) {
    const fidAnchored = hasParentInTree(fid);
    const midAnchored = hasParentInTree(mid);
    if (fidAnchored === midAnchored) continue;
    if (midAnchored && !fidAnchored) {
      const midPos = out.get(mid);
      if (midPos) out.set(fid, { x: midPos.x + NODE_WIDTH + SPOUSE_GAP, y: midPos.y });
    } else if (fidAnchored && !midAnchored) {
      const fidPos = out.get(fid);
      if (fidPos) out.set(mid, { x: fidPos.x + NODE_WIDTH + SPOUSE_GAP, y: fidPos.y });
    }
  }

  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (!idSet.has(r.person_a_id) || !idSet.has(r.person_b_id)) continue;
    const aAnchored = hasParentInTree(r.person_a_id);
    const bAnchored = hasParentInTree(r.person_b_id);
    if (aAnchored === bAnchored) continue;
    if (aAnchored && !bAnchored) {
      const pA = out.get(r.person_a_id);
      if (pA) out.set(r.person_b_id, { x: pA.x + NODE_WIDTH + SPOUSE_GAP, y: pA.y });
    } else if (bAnchored && !aAnchored) {
      const pB = out.get(r.person_b_id);
      if (pB) out.set(r.person_a_id, { x: pB.x + NODE_WIDTH + SPOUSE_GAP, y: pB.y });
    }
  }

  return out;
}
