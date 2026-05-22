import type React from "react";
import * as dagre from "@dagrejs/dagre";
import type { Lang } from "@/lib/lang/server";

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
};

export type GraphNode = {
  id: string;
  type: "person";
  data: PersonNodeData;
  position: { x: number; y: number };
};

export type SpouseStatus = "current" | "divorced" | "widowed";

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "smoothstep" | "straight" | "step" | "family-branch" | "spouse";
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
  };
  style?: React.CSSProperties;
  animated?: boolean;
};

export function buildGraphElements(
  people: PersonInput[],
  relationships: RelationshipInput[],
  lang: Lang,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
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
      edges.push({
        id: `s-${r.person_a_id}-${r.person_b_id}`,
        source: aIsLeft ? r.person_a_id : r.person_b_id,
        target: aIsLeft ? r.person_b_id : r.person_a_id,
        sourceHandle: "right",
        targetHandle: "left-target",
        type: "spouse",
        data: { edgeKind: "spouse", relationshipId: r.id, status },
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
          stroke: "oklch(0.52 0.18 280 / 0.65)",
          strokeWidth: 2,
          strokeDasharray: "7 4",
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
          stroke: "oklch(0.52 0.14 150 / 0.65)",
          strokeWidth: 2,
          strokeDasharray: "3 3",
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

  // ── 1. Build parent-pair groups (for T-junction couples) ─────────────────
  // Key: sorted "fid|mid" so the same couple is always one entry.
  const pairGroups = new Map<string, { fid: string; mid: string; childIds: string[] }>();
  for (const p of people) {
    const fid = p.father_id && idSet.has(p.father_id) ? p.father_id : null;
    const mid = p.mother_id && idSet.has(p.mother_id) ? p.mother_id : null;
    if (!fid || !mid) continue;
    const key = `${fid}|${mid}`;
    if (!pairGroups.has(key)) pairGroups.set(key, { fid, mid, childIds: [] });
    pairGroups.get(key)!.childIds.push(p.id);
  }

  // ── 2. Build Dagre graph with virtual couple nodes ────────────────────────
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90, marginx: 40, marginy: 40 });

  // Real person nodes
  people.forEach((p) => g.setNode(p.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

  // Virtual couple node (1×1) per two-parent family
  for (const key of pairGroups.keys()) {
    g.setNode(`__c__${key}`, { width: 1, height: 1 });
  }

  // Couple edges: both parents → couple node (high weight keeps them together)
  for (const [key, { fid, mid }] of pairGroups) {
    g.setEdge(fid, `__c__${key}`, { weight: 2 });
    g.setEdge(mid, `__c__${key}`, { weight: 2 });
  }

  // Couple node → each child
  for (const [key, { childIds }] of pairGroups) {
    for (const cid of childIds) {
      g.setEdge(`__c__${key}`, cid);
    }
  }

  // Single-parent children (father or mother only)
  for (const p of people) {
    const fid = p.father_id && idSet.has(p.father_id) ? p.father_id : null;
    const mid = p.mother_id && idSet.has(p.mother_id) ? p.mother_id : null;
    if (fid && mid) continue; // already handled via couple node above
    if (fid) g.setEdge(fid, p.id);
    else if (mid) g.setEdge(mid, p.id);
  }

  dagre.layout(g);

  // ── 3. Extract positions (ignore virtual couple nodes) ────────────────────
  const out = new Map<string, { x: number; y: number }>();
  people.forEach((p) => {
    const pos = g.node(p.id);
    if (pos) out.set(p.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  });

  // ── 4. Snap spouses to the same Y level ──────────────────────────────────
  // Two-parent families: snap to the lower of the two dagre Y values so the
  // marriage line is always horizontal and the T-junction formula aligns.
  for (const [, { fid, mid }] of pairGroups) {
    const pA = out.get(fid);
    const pB = out.get(mid);
    if (pA && pB) {
      const alignY = Math.max(pA.y, pB.y);
      out.set(fid, { ...pA, y: alignY });
      out.set(mid, { ...pB, y: alignY });
    }
  }

  // Registered spouse pairs without shared children in this tree
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

  return out;
}
