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
  type: "smoothstep" | "straight" | "step" | "family-branch";
  sourceHandle?: string;
  targetHandle?: string;
  selectable?: boolean;
  focusable?: boolean;
  deletable?: boolean;
  data?: {
    edgeKind: "parent" | "spouse" | "family-branch";
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

  // Build spouse edges after layout so we can route based on actual positions
  const posMap = new Map(nodes.map((n) => [n.id, n.position]));
  for (const r of relationships) {
    if (r.type === "spouse") {
      const posA = posMap.get(r.person_a_id);
      const posB = posMap.get(r.person_b_id);
      const aIsLeft = !posA || !posB || posA.x <= posB.x;
      const status = (r.status ?? "current") as SpouseStatus;
      const style: React.CSSProperties = (() => {
        if (status === "divorced") {
          return {
            stroke: "oklch(0.62 0.20 18 / 0.55)",
            strokeWidth: 2,
            strokeDasharray: "6 5",
          };
        }
        if (status === "widowed") {
          return {
            stroke: "oklch(0.48 0.03 25 / 0.6)",
            strokeWidth: 2,
            strokeDasharray: "2 4",
          };
        }
        // current
        return { stroke: "oklch(0.62 0.20 18 / 0.70)", strokeWidth: 2 };
      })();
      edges.push({
        id: `s-${r.person_a_id}-${r.person_b_id}`,
        source: aIsLeft ? r.person_a_id : r.person_b_id,
        target: aIsLeft ? r.person_b_id : r.person_a_id,
        sourceHandle: "right",
        targetHandle: "left-target",
        type: "straight",
        data: { edgeKind: "spouse", relationshipId: r.id, status },
        style,
      });
    }
  }

  return { nodes, edges };
}

export function autoLayoutPositions(
  people: PersonInput[],
): Map<string, { x: number; y: number }> {
  const idSet = new Set(people.map((p) => p.id));
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 });
  people.forEach((p) => g.setNode(p.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  for (const p of people) {
    if (p.father_id && idSet.has(p.father_id)) g.setEdge(p.father_id, p.id);
    if (p.mother_id && idSet.has(p.mother_id)) g.setEdge(p.mother_id, p.id);
  }
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  people.forEach((p) => {
    const pos = g.node(p.id);
    if (pos) out.set(p.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  });
  return out;
}
