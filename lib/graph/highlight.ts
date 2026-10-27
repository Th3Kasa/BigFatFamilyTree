// Path highlighting for the family canvas.
//
// The relationship finder produces a `PathHighlight` (who is on the route, which
// parent→child links and which stored relationships it crosses). This module
// turns that into per-node and per-edge display state. It is pure — no React —
// so the edge-matching rules are unit tested.
//
// Edge matching rules:
//   • family-branch (one T-bracket per parent pair): only the parent→child
//     segments listed in `parentChild` are lit; the rest of the bracket dims.
//   • spouse / adopted / guardian: lit when their relationship id is on the path.
//     A spouse edge between two *shared ancestors* is lit too (the ancestor
//     couple is part of the story even if the route only touches one of them).
//   • everything else dims.

import { pathHighlight, type KinResult } from "@/lib/kinship";
import type { GraphEdge } from "./transform";

/** Opacity of everything that is not part of the highlighted path. */
export const DIM_OPACITY = 0.35;

export type PathHighlight = {
  /** Everyone to light up: the route plus the shared ancestors. */
  nodeIds: string[];
  /** Blood parent→child links on the route. */
  parentChild: { parentId: string; childId: string }[];
  /** Stored relationships (spouse, adoption, guardian, godparent) on the route. */
  relationshipIds: string[];
  /** The route in order, A → B. A person's step badge is their index + 1. */
  steps: string[];
  /** Nearest shared ancestors (may or may not be on the route). */
  ancestorIds: string[];
};

export type NodeHighlight =
  | { state: "on"; /** 1-based step number, or null for a shared ancestor off the route. */ step: number | null; ancestor: boolean }
  | { state: "dim" };

export type EdgeHighlight = {
  on: boolean;
  /** family-branch only: the children whose segment of the bracket is lit. */
  childIds?: string[];
};

export function toPathHighlight(result: KinResult): PathHighlight {
  const base = pathHighlight(result);
  return {
    ...base,
    steps: result.kind === "none" ? [] : result.path,
    ancestorIds: "sharedAncestors" in result ? result.sharedAncestors : [],
  };
}

export type HighlightIndex = {
  nodes: Set<string>;
  steps: Map<string, number>;
  ancestors: Set<string>;
  relationships: Set<string>;
  /** parentId → children reached through that parent on the route. */
  childrenOf: Map<string, Set<string>>;
};

/** Lookup tables for a highlight; null means "no highlight active" (nothing dims). */
export function buildHighlightIndex(h: PathHighlight | null | undefined): HighlightIndex | null {
  if (!h || h.nodeIds.length === 0) return null;
  const steps = new Map<string, number>();
  h.steps.forEach((id, i) => {
    if (!steps.has(id)) steps.set(id, i + 1);
  });
  const childrenOf = new Map<string, Set<string>>();
  for (const { parentId, childId } of h.parentChild) {
    const set = childrenOf.get(parentId);
    if (set) set.add(childId);
    else childrenOf.set(parentId, new Set([childId]));
  }
  return {
    nodes: new Set(h.nodeIds),
    steps,
    ancestors: new Set(h.ancestorIds),
    relationships: new Set(h.relationshipIds),
    childrenOf,
  };
}

export function nodeHighlight(index: HighlightIndex, nodeId: string): NodeHighlight {
  if (!index.nodes.has(nodeId)) return { state: "dim" };
  return { state: "on", step: index.steps.get(nodeId) ?? null, ancestor: index.ancestors.has(nodeId) };
}

/** Which children of a parent-pair bracket are reached through one of its parents. */
export function litBranchChildren(
  index: HighlightIndex,
  branch: { fatherId?: string | null; motherId?: string | null; childIds?: string[] },
): string[] {
  const { fatherId, motherId, childIds = [] } = branch;
  return childIds.filter(
    (c) => (!!fatherId && index.childrenOf.get(fatherId)?.has(c)) || (!!motherId && index.childrenOf.get(motherId)?.has(c)),
  );
}

type EdgeLike = Pick<GraphEdge, "id" | "source" | "target" | "data">;

export function edgeHighlight(index: HighlightIndex, edge: EdgeLike): EdgeHighlight {
  const data = edge.data;
  switch (data?.edgeKind) {
    case "family-branch": {
      const childIds = litBranchChildren(index, data);
      return { on: childIds.length > 0, childIds };
    }
    case "spouse": {
      const onRoute = !!data.relationshipId && index.relationships.has(data.relationshipId);
      const ancestorCouple = index.ancestors.has(edge.source) && index.ancestors.has(edge.target);
      return { on: onRoute || ancestorCouple };
    }
    case "adopted":
    case "guardian":
      return { on: !!data.relationshipId && index.relationships.has(data.relationshipId) };
    default:
      return { on: false };
  }
}

/**
 * Returns a copy of `edge` carrying its highlight state. Custom edges (bracket,
 * spouse) read `data.highlight`; the built-in straight edges (adopted,
 * guardian) get their style rewritten. The input is never mutated.
 */
export function applyEdgeHighlight(edge: GraphEdge, index: HighlightIndex): GraphEdge {
  const highlight = edgeHighlight(index, edge);
  const zIndex = highlight.on ? 10 : 0;
  const kind = edge.data?.edgeKind;

  if (kind === "family-branch" || kind === "spouse") {
    return { ...edge, zIndex, data: { ...edge.data!, highlight } };
  }
  if (kind === "adopted" || kind === "guardian") {
    return {
      ...edge,
      zIndex,
      style: highlight.on
        ? { ...edge.style, stroke: "var(--path)", strokeWidth: 4, strokeDasharray: undefined, opacity: 1 }
        : { ...edge.style, opacity: DIM_OPACITY },
    };
  }
  return { ...edge, zIndex, style: { ...edge.style, opacity: DIM_OPACITY } };
}
