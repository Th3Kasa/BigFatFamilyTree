import { describe, it, expect } from "vitest";
import { buildGraphElements } from "@/lib/graph/transform";

const people = [
  {
    id: "p1", given_en: "Alice", given_ar: "أليس",
    family_name_en: "Smith", family_name_ar: "سميث",
    father_id: null, mother_id: null,
    gender: "f" as const, is_placeholder: false, photo_url: null,
  },
  {
    id: "p2", given_en: null, given_ar: null,
    family_name_en: null, family_name_ar: null,
    father_id: null, mother_id: null,
    gender: "m" as const, is_placeholder: true, photo_url: null,
  },
  {
    id: "p3", given_en: "Carol", given_ar: "كارول",
    family_name_en: "Smith", family_name_ar: "سميث",
    father_id: "p2", mother_id: "p1",
    gender: "f" as const, is_placeholder: false, photo_url: null,
  },
];

const relationships = [
  { id: "r1", person_a_id: "p1", person_b_id: "p2", type: "spouse" as const, status: "current" as const, order_index: 1 },
];

describe("buildGraphElements", () => {
  it("creates one node per person", () => {
    const { nodes } = buildGraphElements(people, relationships, "en");
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.id)).toContain("p1");
  });

  it("node data carries person and lang", () => {
    const { nodes } = buildGraphElements(people, relationships, "ar");
    const n = nodes.find((n) => n.id === "p1")!;
    expect(n.data.person.id).toBe("p1");
    expect(n.data.lang).toBe("ar");
  });

  it("creates father_id edge as f-<child>", () => {
    const { edges } = buildGraphElements(people, relationships, "en");
    expect(edges.find((e) => e.id === "f-p3")).toBeDefined();
  });

  it("creates mother_id edge as m-<child>", () => {
    const { edges } = buildGraphElements(people, relationships, "en");
    expect(edges.find((e) => e.id === "m-p3")).toBeDefined();
  });

  it("creates spouse edge from relationships", () => {
    const { edges } = buildGraphElements(people, relationships, "en");
    expect(edges.find((e) => e.id === "s-p1-p2")).toBeDefined();
  });

  it("dagre assigns numeric positions to all nodes", () => {
    const { nodes } = buildGraphElements(people, relationships, "en");
    for (const n of nodes) {
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
      expect(isNaN(n.position.x)).toBe(false);
    }
  });

  it("handles empty input gracefully", () => {
    const { nodes, edges } = buildGraphElements([], [], "en");
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });
});
