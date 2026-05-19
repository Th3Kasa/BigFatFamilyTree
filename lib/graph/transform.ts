import type React from "react";
import * as dagre from "@dagrejs/dagre";
import type { Lang } from "@/lib/lang/server";

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;

export type PersonInput = {
  id: string;
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
  lang: Lang;
};

export type GraphNode = {
  id: string;
  type: "person";
  data: PersonNodeData;
  position: { x: number; y: number };
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "smoothstep" | "straight";
  data?: { edgeKind: "parent" | "spouse" };
  style?: React.CSSProperties;
  animated?: boolean;
};

export function buildGraphElements(
  people: PersonInput[],
  relationships: RelationshipInput[],
  lang: Lang,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const idSet = new Set(people.map((p) => p.id));

  const nodes: GraphNode[] = people.map((p) => ({
    id: p.id,
    type: "person",
    data: { person: p, lang },
    position: { x: p.pos_x ?? 0, y: p.pos_y ?? 0 },
  }));

  const edges: GraphEdge[] = [];

  for (const p of people) {
    if (p.father_id && idSet.has(p.father_id)) {
      edges.push({ id: `f-${p.id}`, source: p.father_id, target: p.id, type: "smoothstep", data: { edgeKind: "parent" } });
    }
    if (p.mother_id && idSet.has(p.mother_id)) {
      edges.push({ id: `m-${p.id}`, source: p.mother_id, target: p.id, type: "smoothstep", data: { edgeKind: "parent" } });
    }
  }

  for (const r of relationships) {
    if (r.type === "spouse") {
      edges.push({
        id: `s-${r.person_a_id}-${r.person_b_id}`,
        source: r.person_a_id,
        target: r.person_b_id,
        type: "straight",
        data: { edgeKind: "spouse" },
        style: { stroke: "#f43f5e", strokeDasharray: "5 4", strokeWidth: 1.5 },
      });
    }
  }

  // Only nodes WITHOUT stored positions go through dagre
  const unpositioned = nodes.filter((n) => {
    const p = (n.data as PersonNodeData).person;
    return p.pos_x == null || p.pos_y == null;
  });

  if (unpositioned.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 });
    unpositioned.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
    edges
      .filter((e) => e.data?.edgeKind === "parent")
      .filter((e) => unpositioned.some((n) => n.id === e.source) && unpositioned.some((n) => n.id === e.target))
      .forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    unpositioned.forEach((n) => {
      const pos = g.node(n.id);
      if (pos) {
        n.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
      }
    });
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
