import { describe, test, expect } from "vitest";
import { buildGraphElements } from "./transform";
import type { GraphEdge, PersonInput, RelationshipInput } from "./transform";
import { buildKinGraph, findRelationship } from "@/lib/kinship";
import {
  applyEdgeHighlight,
  buildHighlightIndex,
  DIM_OPACITY,
  edgeHighlight,
  litBranchChildren,
  nodeHighlight,
  toPathHighlight,
} from "./highlight";

function person(id: string, o: Partial<PersonInput> = {}): PersonInput {
  return {
    id,
    slug: id,
    given_en: id,
    given_ar: null,
    family_name_en: null,
    family_name_ar: null,
    father_id: null,
    mother_id: null,
    gender: "unknown",
    is_placeholder: false,
    photo_url: null,
    pos_x: 0,
    pos_y: 0,
    ...o,
  };
}

function rel(id: string, type: RelationshipInput["type"], a: string, b: string, status: RelationshipInput["status"] = "current"): RelationshipInput {
  return { id, type, person_a_id: a, person_b_id: b, status, order_index: 1 };
}

// Grandparents Youssef + Mariam → Khaled (+ Nour) and Salma (+ Hani).
//   Khaled + Nour → Omar, Rana         Salma + Hani → Tarek, Dina
// Plus Adam, adopted by Khaled.
const people: PersonInput[] = [
  person("youssef", { gender: "m" }),
  person("mariam", { gender: "f" }),
  person("khaled", { gender: "m", father_id: "youssef", mother_id: "mariam" }),
  person("salma", { gender: "f", father_id: "youssef", mother_id: "mariam" }),
  person("nour", { gender: "f" }),
  person("hani", { gender: "m" }),
  person("omar", { gender: "m", father_id: "khaled", mother_id: "nour" }),
  person("rana", { gender: "f", father_id: "khaled", mother_id: "nour" }),
  person("tarek", { gender: "m", father_id: "hani", mother_id: "salma" }),
  person("dina", { gender: "f", father_id: "hani", mother_id: "salma" }),
  person("adam", { gender: "m" }),
];
const relationships: RelationshipInput[] = [
  rel("r-grand", "spouse", "youssef", "mariam"),
  rel("r-kn", "spouse", "khaled", "nour"),
  rel("r-sh", "spouse", "salma", "hani"),
  rel("r-adopt", "adopted_by", "adam", "khaled"),
];

const { edges } = buildGraphElements(people, relationships, "en");
const graph = buildKinGraph(people, relationships);
const highlightFor = (a: string, b: string) => buildHighlightIndex(toPathHighlight(findRelationship(graph, a, b)));

const byId = (id: string) => edges.find((e) => e.id === id)!;
const branch = (father: string, mother: string) => byId(`fb-${father}|${mother}`);

describe("buildHighlightIndex", () => {
  test("no highlight, or an empty one, means nothing dims", () => {
    expect(buildHighlightIndex(null)).toBeNull();
    expect(buildHighlightIndex(undefined)).toBeNull();
    expect(buildHighlightIndex(toPathHighlight({ kind: "none" }))).toBeNull();
  });
});

describe("first cousins: Omar and Tarek", () => {
  const index = highlightFor("omar", "tarek")!;

  test("numbers the route in order A → B", () => {
    expect(nodeHighlight(index, "omar")).toEqual({ state: "on", step: 1, ancestor: false });
    expect(nodeHighlight(index, "khaled")).toMatchObject({ state: "on", step: 2 });
    expect(nodeHighlight(index, "tarek")).toMatchObject({ state: "on", step: 5 });
  });

  test("the shared grandparent couple is lit even where one of them is off the route", () => {
    const on = ["youssef", "mariam"].map((id) => nodeHighlight(index, id));
    expect(on.every((n) => n.state === "on")).toBe(true);
    // Exactly one of them is a route stop; the other is shown as an ancestor with no number.
    expect(on.filter((n) => n.state === "on" && n.step === null)).toHaveLength(1);
  });

  test("everyone else dims", () => {
    expect(nodeHighlight(index, "rana")).toEqual({ state: "dim" });
    expect(nodeHighlight(index, "dina")).toEqual({ state: "dim" });
    expect(nodeHighlight(index, "adam")).toEqual({ state: "dim" });
  });

  test("a bracket lights only the child segments on the route, not its siblings", () => {
    // Omar and Rana share a bracket; only Omar is on the route.
    expect(litBranchChildren(index, { fatherId: "khaled", motherId: "nour", childIds: ["omar", "rana"] })).toEqual(["omar"]);
    expect(edgeHighlight(index, branch("khaled", "nour"))).toEqual({ on: true, childIds: ["omar"] });
    expect(edgeHighlight(index, branch("hani", "salma"))).toEqual({ on: true, childIds: ["tarek"] });
  });

  test("the grandparents' bracket lights the two children on the route and leaves out nothing else", () => {
    const h = edgeHighlight(index, branch("youssef", "mariam"));
    expect(h.on).toBe(true);
    expect([...(h.childIds ?? [])].sort()).toEqual(["khaled", "salma"]);
  });

  test("the ancestor couple's marriage line is lit; other marriages are not", () => {
    expect(edgeHighlight(index, byId("s-r-grand")).on).toBe(true);
    expect(edgeHighlight(index, byId("s-r-kn")).on).toBe(false);
    expect(edgeHighlight(index, byId("s-r-sh")).on).toBe(false);
  });

  test("a bracket the route does not cross is dimmed, not lit", () => {
    // Adam is adopted: no blood bracket for him; Khaled/Nour's bracket is lit only for Omar.
    expect(edgeHighlight(index, byId("adopt-r-adopt")).on).toBe(false);
  });
});

describe("a route that crosses a marriage and an adoption", () => {
  test("lights the spouse edge whose relationship is on the route", () => {
    const index = highlightFor("omar", "hani")!; // Hani is the husband of Omar's aunt Salma
    expect(edgeHighlight(index, byId("s-r-sh")).on).toBe(true);
    expect(edgeHighlight(index, byId("s-r-kn")).on).toBe(false);
  });

  test("lights an adoption edge on the route and none of the others", () => {
    const index = highlightFor("adam", "omar")!;
    expect(edgeHighlight(index, byId("adopt-r-adopt")).on).toBe(true);
    expect(edgeHighlight(index, byId("s-r-grand")).on).toBe(false);
  });
});

describe("applyEdgeHighlight", () => {
  const index = highlightFor("adam", "omar")!;

  test("custom edges get data.highlight and a z-index; the input is untouched", () => {
    const original = branch("khaled", "nour");
    const snapshot = JSON.stringify(original);
    const out = applyEdgeHighlight(original, index);
    expect(out.data?.highlight).toEqual({ on: true, childIds: ["omar"] });
    expect(out.zIndex).toBe(10);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  test("a lit adoption edge turns the path colour, thick and solid", () => {
    const out = applyEdgeHighlight(byId("adopt-r-adopt"), index);
    expect(out.style).toMatchObject({ stroke: "var(--path)", strokeWidth: 4, opacity: 1 });
    expect(out.style?.strokeDasharray).toBeUndefined();
    expect(out.zIndex).toBe(10);
  });

  test("an unrelated adoption edge dims and keeps its dashes", () => {
    const other = { ...byId("adopt-r-adopt"), id: "adopt-x", data: { edgeKind: "adopted", relationshipId: "other" } } as GraphEdge;
    const out = applyEdgeHighlight(other, index);
    expect(out.style?.opacity).toBe(DIM_OPACITY);
    expect(out.style?.strokeDasharray).toBe(byId("adopt-r-adopt").style?.strokeDasharray);
    expect(out.zIndex).toBe(0);
  });

  test("an unlit spouse edge is marked off so it can dim", () => {
    const out = applyEdgeHighlight(byId("s-r-sh"), index);
    expect(out.data?.highlight).toEqual({ on: false });
  });
});
