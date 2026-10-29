import type React from "react";
import type { Lang } from "@/lib/lang/server";
import { EDGE_STYLES } from "./edge-styles";
import type { EdgeHighlight, NodeHighlight } from "./highlight";
import { laneBetween, type Rect } from "./geometry";
import { resolvePositions } from "./layout";
import { buildFamilyModel, marriageOrdinal } from "./units";

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
  /** Optional: shown as years on the card when the query selects them. */
  birth_date?: string | null;
  death_date?: string | null;
};

export type RelationshipInput = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  type: "spouse" | "adopted_by" | "raised_by" | "godparent";
  status: "current" | "divorced" | "widowed";
  order_index: number;
};

/** Which "+ Add …" placeholders to show around the selected card. */
export type SlotKind = "father" | "mother" | "partner" | "child" | "sibling";

export type PersonNodeData = {
  person: PersonInput;
  lang: Lang;
  /** Guest / finder view: no editing affordances. */
  readOnly?: boolean;
  /** Relationship-finder highlight: set only while a path is active. */
  highlight?: NodeHighlight;
  /** Dashed "+ Add …" placeholders to draw around this (selected) card. */
  slots?: SlotKind[];
  onSlot?: (slot: SlotKind) => void;
  /** Reference card only: the branch the real card sits in, and how to get there. */
  refOf?: string;
  onOpenOriginal?: (personId: string) => void;
};

export type GraphNode = {
  id: string;
  type: "person" | "personRef";
  data: PersonNodeData;
  position: { x: number; y: number };
  /** Reference cards ride along with their host card. */
  parentId?: string;
  draggable?: boolean;
  selectable?: boolean;
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
    /** The two people of a spouse / adoption / guardian link (cards may be reference cards). */
    personIds?: [string, string];
    fatherId?: string | null;
    motherId?: string | null;
    childIds?: string[];
    /** family-branch: the card(s) whose couple line the children hang from. */
    partnerNodeIds?: [string, string | null];
    /** Lane of the couple line: 0 between neighbours, 1+ under the row. */
    lane?: number;
    /** True when this spouse edge is a past relationship of a remarried person. */
    ghost?: boolean;
    /** Marriage order (relationships.order_index) — 1st, 2nd, … */
    orderIndex?: number;
    /** True when either spouse has more than one marriage, so the order label is meaningful. */
    showOrder?: boolean;
    /** 1-based marriage number from the perspective of the partner with several marriages. */
    ordinal?: number | null;
    /** Co-parents with no recorded marriage. */
    implicit?: boolean;
    /** Language for the marriage label. */
    lang?: Lang;
    /** Relationship-finder highlight: set only while a path is active. */
    highlight?: EdgeHighlight;
  };
  style?: React.CSSProperties;
  animated?: boolean;
  zIndex?: number;
};

export function buildGraphElements(
  people: PersonInput[],
  relationships: RelationshipInput[],
  lang: Lang,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const model = buildFamilyModel(people, relationships);
  const { positions, refPositions } = resolvePositions(people, relationships, model);

  const nodes: GraphNode[] = people.map((p) => ({
    id: p.id,
    type: "person",
    data: { person: p, lang },
    position: positions.get(p.id) ?? { x: p.pos_x ?? 0, y: p.pos_y ?? 0 },
  }));
  // Reference cards come after every person so their host (parent) node exists first.
  for (const ref of model.refs) {
    const person = byId.get(ref.personId);
    const host = positions.get(ref.hostId);
    const abs = refPositions.get(ref.refId);
    if (!person || !host || !abs) continue;
    nodes.push({
      id: ref.refId,
      type: "personRef",
      parentId: ref.hostId,
      draggable: false,
      data: { person, lang, refOf: ref.personId },
      position: { x: abs.x - host.x, y: abs.y - host.y },
    });
  }

  const absOf = new Map<string, Rect>();
  for (const p of people) absOf.set(p.id, positions.get(p.id) ?? { x: 0, y: 0 });
  for (const ref of model.refs) {
    const abs = refPositions.get(ref.refId);
    if (abs) absOf.set(ref.refId, abs);
  }
  const allRects = [...absOf.values()];
  const laneOf = (a: string, b: string) => laneBetween(absOf.get(a)!, absOf.get(b)!, allRects);
  const leftFirst = (a: string, b: string): [string, string] => (absOf.get(a)!.x <= absOf.get(b)!.x ? [a, b] : [b, a]);

  const edges: GraphEdge[] = [];
  const hasCurrent = new Set<string>();
  for (const u of model.unions.values()) {
    if (u.b && !u.implicit && u.status === "current") {
      hasCurrent.add(u.a);
      hasCurrent.add(u.b);
    }
  }
  const marriages = (pid: string) => (model.unionsOf.get(pid) ?? []).filter((u) => !u.implicit).length;

  for (const u of model.unions.values()) {
    const at = model.drawnAt.get(u.id);
    if (!at || !absOf.has(at.nodeA) || (at.nodeB && !absOf.has(at.nodeB))) continue;

    // Children's bracket, hanging from this couple's line.
    if (u.childIds.length > 0) {
      const [left, right] = at.nodeB ? leftFirst(at.nodeA, at.nodeB) : [at.nodeA, null];
      edges.push({
        id: `fb-${u.fatherId ?? ""}|${u.motherId ?? ""}`,
        source: left,
        target: u.childIds[0],
        type: "family-branch",
        sourceHandle: "bottom",
        targetHandle: "top",
        selectable: false,
        focusable: false,
        deletable: false,
        data: {
          edgeKind: "family-branch",
          fatherId: u.fatherId,
          motherId: u.motherId,
          childIds: u.childIds,
          partnerNodeIds: [left, right],
          lane: right ? laneOf(left, right) : 0,
        },
      });
    }

    if (!u.b || !at.nodeB) continue;
    const [source, target] = leftFirst(at.nodeA, at.nodeB);
    const lane = laneOf(source, target);
    const showOrder = marriages(u.a) > 1 || marriages(u.b) > 1;
    const perspective = marriages(u.a) >= marriages(u.b) ? u.a : u.b;
    const ordinal = showOrder ? marriageOrdinal(model, perspective, u.id) : null;
    const rows = u.implicit ? [null] : u.relationshipIds;
    for (const rid of rows) {
      const r = rid ? relationships.find((x) => x.id === rid) : undefined;
      const status = (r?.status ?? "current") as SpouseStatus;
      edges.push({
        id: rid ? `s-${rid}` : `s-${u.id.slice(2)}`,
        source,
        target,
        sourceHandle: "right",
        targetHandle: "left-target",
        type: "spouse",
        data: {
          edgeKind: "spouse",
          relationshipId: rid ?? undefined,
          status,
          personIds: [u.a, u.b],
          ghost: status !== "current" && (hasCurrent.has(u.a) || hasCurrent.has(u.b)),
          orderIndex: r?.order_index ?? u.orderIndex,
          showOrder: !u.implicit && showOrder,
          ordinal,
          implicit: u.implicit || undefined,
          lane,
          lang,
        },
      });
    }
  }

  for (const r of relationships) {
    if (r.type !== "adopted_by" && r.type !== "raised_by") continue;
    // person_a = the child, person_b = adoptive parent / guardian
    if (!byId.has(r.person_a_id) || !byId.has(r.person_b_id)) continue;
    const adopted = r.type === "adopted_by";
    const style = adopted ? EDGE_STYLES.adopted : EDGE_STYLES.guardian;
    edges.push({
      id: `${adopted ? "adopt" : "guardian"}-${r.id}`,
      source: r.person_b_id,
      target: r.person_a_id,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "straight",
      selectable: false,
      focusable: false,
      deletable: false,
      data: { edgeKind: adopted ? "adopted" : "guardian", relationshipId: r.id, personIds: [r.person_a_id, r.person_b_id] },
      style: { stroke: style.stroke, strokeWidth: 2, strokeDasharray: style.dash },
    });
  }

  return { nodes, edges };
}

/**
 * The spouse, adoption and guardian rows behind a set of edges. The canvas
 * receives edges rather than raw rows, and the family panel / Family view need
 * the rows back (ids, status, order) without another query.
 */
export function relationshipsFromEdges(edges: GraphEdge[]): RelationshipInput[] {
  const out = new Map<string, RelationshipInput>();
  for (const e of edges) {
    const d = e.data;
    if (!d?.relationshipId || !d.personIds) continue;
    const [a, b] = d.personIds;
    if (d.edgeKind === "spouse") {
      out.set(d.relationshipId, { id: d.relationshipId, person_a_id: a, person_b_id: b, type: "spouse", status: d.status ?? "current", order_index: d.orderIndex ?? 0 });
    } else if (d.edgeKind === "adopted" || d.edgeKind === "guardian") {
      out.set(d.relationshipId, { id: d.relationshipId, person_a_id: a, person_b_id: b, type: d.edgeKind === "adopted" ? "adopted_by" : "raised_by", status: "current", order_index: 0 });
    }
  }
  return [...out.values()];
}

