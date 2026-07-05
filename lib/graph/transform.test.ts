import { describe, test, expect } from "vitest";
import { buildGraphElements } from "./transform";
import type { PersonInput, RelationshipInput } from "./transform";

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------
function person(id: string, overrides: Partial<PersonInput> = {}): PersonInput {
  return {
    id,
    slug: id,
    given_en: id,
    given_ar: null,
    family_name_en: "Test",
    family_name_ar: null,
    father_id: null,
    mother_id: null,
    gender: "unknown",
    is_placeholder: false,
    photo_url: null,
    pos_x: 0,
    pos_y: 0,
    ...overrides,
  };
}

function spouse(
  id: string,
  a: string,
  b: string,
  status: RelationshipInput["status"] = "current",
  order_index = 1,
): RelationshipInput {
  return { id, person_a_id: a, person_b_id: b, type: "spouse", status, order_index };
}

function spouseEdges(edges: ReturnType<typeof buildGraphElements>["edges"]) {
  return edges.filter((e) => e.data?.edgeKind === "spouse");
}

// ---------------------------------------------------------------------------
// Spouse edge identity
// ---------------------------------------------------------------------------
describe("spouse edge ids", () => {
  test("divorce + remarriage between the SAME pair yields two edges with unique ids", () => {
    const people = [person("a"), person("b")];
    const relationships = [
      spouse("r1", "a", "b", "divorced", 1),
      spouse("r2", "a", "b", "current", 2),
    ];
    const { edges } = buildGraphElements(people, relationships, "en");
    const sEdges = spouseEdges(edges);
    expect(sEdges).toHaveLength(2);
    const ids = new Set(sEdges.map((e) => e.id));
    expect(ids.size).toBe(2);
  });

  test("edge ids are keyed on the relationship row, not the pair", () => {
    const people = [person("a"), person("b")];
    const { edges } = buildGraphElements(people, [spouse("rel-42", "a", "b")], "en");
    expect(spouseEdges(edges)[0].id).toBe("s-rel-42");
  });
});

// ---------------------------------------------------------------------------
// Ghost (past marriage of a remarried person)
// ---------------------------------------------------------------------------
describe("ghost flag", () => {
  test("past marriage is ghost when a participant has remarried", () => {
    const people = [person("a"), person("b"), person("c")];
    const relationships = [
      spouse("r1", "a", "c", "divorced", 1),
      spouse("r2", "a", "b", "current", 2),
    ];
    const { edges } = buildGraphElements(people, relationships, "en");
    const byId = new Map(spouseEdges(edges).map((e) => [e.data?.relationshipId, e]));
    expect(byId.get("r1")?.data?.ghost).toBe(true);
    expect(byId.get("r2")?.data?.ghost).toBe(false);
  });

  test("divorced couple where NEITHER remarried is not ghost", () => {
    const people = [person("a"), person("b")];
    const { edges } = buildGraphElements(people, [spouse("r1", "a", "b", "divorced")], "en");
    expect(spouseEdges(edges)[0].data?.ghost).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Marriage-order badge data
// ---------------------------------------------------------------------------
describe("marriage order", () => {
  test("polygamy: both marriages carry orderIndex and showOrder", () => {
    const people = [person("h"), person("w1"), person("w2")];
    const relationships = [
      spouse("r1", "h", "w1", "current", 1),
      spouse("r2", "h", "w2", "current", 2),
    ];
    const { edges } = buildGraphElements(people, relationships, "en");
    const byId = new Map(spouseEdges(edges).map((e) => [e.data?.relationshipId, e]));
    expect(byId.get("r1")?.data?.orderIndex).toBe(1);
    expect(byId.get("r1")?.data?.showOrder).toBe(true);
    expect(byId.get("r2")?.data?.orderIndex).toBe(2);
    expect(byId.get("r2")?.data?.showOrder).toBe(true);
  });

  test("single marriage: badge suppressed", () => {
    const people = [person("a"), person("b")];
    const { edges } = buildGraphElements(people, [spouse("r1", "a", "b")], "en");
    expect(spouseEdges(edges)[0].data?.showOrder).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Family-branch grouping
// ---------------------------------------------------------------------------
describe("family branch groups", () => {
  test("siblings of the same parent pair share one branch edge", () => {
    const people = [
      person("dad"),
      person("mom"),
      person("kid1", { father_id: "dad", mother_id: "mom" }),
      person("kid2", { father_id: "dad", mother_id: "mom" }),
    ];
    const { edges } = buildGraphElements(people, [spouse("r1", "dad", "mom")], "en");
    const branches = edges.filter((e) => e.data?.edgeKind === "family-branch");
    expect(branches).toHaveLength(1);
    expect(branches[0].data?.childIds).toEqual(["kid1", "kid2"]);
  });

  test("child of an unknown mother is a separate group with motherId null", () => {
    const people = [
      person("dad"),
      person("mom"),
      person("kid1", { father_id: "dad", mother_id: "mom" }),
      person("kid2", { father_id: "dad", mother_id: null }),
    ];
    const { edges } = buildGraphElements(people, [spouse("r1", "dad", "mom")], "en");
    const branches = edges.filter((e) => e.data?.edgeKind === "family-branch");
    expect(branches).toHaveLength(2);
    const soloBranch = branches.find((e) => e.data?.childIds?.includes("kid2"));
    expect(soloBranch?.data?.fatherId).toBe("dad");
    expect(soloBranch?.data?.motherId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// v2 layout parity — same guarantees hold on the v2 branch
// ---------------------------------------------------------------------------
describe("v2 layout parity", () => {
  test("unique spouse edge ids and ghost flag survive the v2 branch", () => {
    const people = [person("a"), person("b"), person("c")];
    const relationships = [
      spouse("r1", "a", "c", "divorced", 1),
      spouse("r2", "a", "b", "current", 2),
    ];
    const { edges } = buildGraphElements(people, relationships, "en", { layout: "v2" });
    const sEdges = spouseEdges(edges);
    expect(new Set(sEdges.map((e) => e.id)).size).toBe(2);
    const byId = new Map(sEdges.map((e) => [e.data?.relationshipId, e]));
    expect(byId.get("r1")?.data?.ghost).toBe(true);
    expect(byId.get("r1")?.data?.showOrder).toBe(true);
  });
});
