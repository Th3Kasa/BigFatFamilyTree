import { describe, expect, test } from "vitest";
import { ROW_HEIGHT } from "./layout";
import { COLLAPSED_ROW, collapseGenerations, generationRows } from "./generations";
import type { GraphEdge, GraphNode } from "./transform";

const node = (id: string, row: number, x: number, family: string | null = "Morkos", extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  type: "person",
  position: { x, y: row * ROW_HEIGHT },
  data: {
    lang: "en",
    person: {
      id, slug: id, given_en: id, given_ar: null, family_name_en: family, family_name_ar: null,
      father_id: null, mother_id: null, gender: "unknown", is_placeholder: false, photo_url: null, pos_x: null, pos_y: null,
    },
  },
  ...extra,
});

const nodes = [
  node("adly", 0, 0), node("isis", 0, 200, "Micheal"),
  node("ezzat", 1, 0), node("hanan", 1, 200, "Mansour"),
  node("basem", 2, 0), node("amir", 2, 200), node("ramy", 2, 400),
  { ...node("ezzat-ref", 0, 10), type: "personRef" as const, parentId: "ezzat" },
];
const edges: GraphEdge[] = [
  { id: "m1", source: "adly", target: "isis", type: "spouse", data: { edgeKind: "spouse", personIds: ["adly", "isis"] } },
  { id: "b1", source: "adly", target: "ezzat", type: "family-branch", data: { edgeKind: "family-branch", childIds: ["ezzat"], partnerNodeIds: ["adly", "isis"] } },
  { id: "b2", source: "ezzat", target: "basem", type: "family-branch", data: { edgeKind: "family-branch", childIds: ["basem", "amir", "ramy"], partnerNodeIds: ["ezzat", "hanan"] } },
];

describe("generationRows", () => {
  test("counts people per row, ignoring reference cards", () => {
    expect(generationRows(nodes, new Set()).map((r) => [r.index, r.count])).toEqual([[0, 2], [1, 2], [2, 3]]);
  });

  test("rows below a minimised generation move up; the minimised one keeps a slim slot", () => {
    const rows = generationRows(nodes, new Set([1]));
    expect(rows[1]).toMatchObject({ collapsed: true, centerY: ROW_HEIGHT + COLLAPSED_ROW / 2 });
    expect(rows[2].centerY).toBeLessThan(2 * ROW_HEIGHT);
  });
});

describe("collapseGenerations", () => {
  test("nothing minimised: the same arrays come back", () => {
    const out = collapseGenerations(nodes, edges, new Set());
    expect(out.nodes).toBe(nodes);
    expect(out.edges).toBe(edges);
  });

  test("hides the row, its reference cards and every line touching it, and closes the gap", () => {
    const out = collapseGenerations(nodes, edges, new Set([1]));
    const hidden = out.nodes.filter((n) => n.hidden).map((n) => n.id);
    expect(hidden).toEqual(["ezzat", "hanan", "ezzat-ref"]);
    expect(out.edges.filter((e) => e.hidden).map((e) => e.id)).toEqual(["b1", "b2"]);
    expect(out.edges.find((e) => e.id === "m1")?.hidden).toBeUndefined();
    const basem = out.nodes.find((n) => n.id === "basem")!;
    expect(basem.position.y).toBe(2 * ROW_HEIGHT - (ROW_HEIGHT - COLLAPSED_ROW));
    expect(out.nodes.find((n) => n.id === "adly")!.position.y).toBe(0);
  });
});
