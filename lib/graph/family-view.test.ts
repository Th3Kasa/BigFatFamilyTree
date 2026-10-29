import { describe, expect, test } from "vitest";
import { defaultFamilyFocus, familyView, halfSiblingHeading, marriageLabel } from "./family-view";
import type { PersonInput, RelationshipInput } from "./transform";

function person(id: string, o: Partial<PersonInput> = {}): PersonInput {
  return {
    id, slug: id, given_en: id, given_ar: null, family_name_en: null, family_name_ar: null,
    father_id: null, mother_id: null, gender: "unknown", is_placeholder: false, photo_url: null,
    pos_x: null, pos_y: null, ...o,
  };
}
const rel = (id: string, a: string, b: string, status: RelationshipInput["status"], order_index: number): RelationshipInput =>
  ({ id, person_a_id: a, person_b_id: b, type: "spouse", status, order_index });

// Dad married Mum (widowed), then Step (current). Omar is Mum's son; Lina is Step's.
// Omar married Sara (divorced) then Maya (current), with a child in each marriage.
const people = [
  person("dad", { gender: "m" }), person("mum", { gender: "f" }), person("step", { gender: "f" }),
  person("omar", { gender: "m", father_id: "dad", mother_id: "mum", birth_date: "1990" }),
  person("rami", { gender: "m", father_id: "dad", mother_id: "mum", birth_date: "1993" }),
  person("lina", { gender: "f", father_id: "dad", mother_id: "step", birth_date: "2005" }),
  person("sara", { gender: "f" }), person("maya", { gender: "f" }),
  person("k1", { father_id: "omar", mother_id: "sara" }),
  person("k2", { father_id: "omar", mother_id: "maya" }),
  person("k3", { father_id: "omar" }),
];
const rels = [
  rel("r1", "dad", "mum", "widowed", 1), rel("r2", "dad", "step", "current", 2),
  rel("r3", "omar", "sara", "divorced", 1), rel("r4", "omar", "maya", "current", 2),
];

describe("familyView", () => {
  const v = familyView("omar", people, rels)!;

  test("parents, with Dad's other marriage collapsed under him", () => {
    expect(v.father?.person.id).toBe("dad");
    expect(v.mother?.person.id).toBe("mum");
    expect(v.father?.otherUnions).toHaveLength(1);
    expect(v.father?.otherUnions[0].partner?.id).toBe("step");
    expect(v.father?.otherUnions[0].children.map((c) => c.id)).toEqual(["lina"]);
    expect(v.mother?.otherUnions).toEqual([]);
  });

  test("each of Omar's marriages is its own block with its own children", () => {
    expect(v.unions.map((u) => [u.partner?.id, u.ordinal, u.status, u.children.map((c) => c.id)])).toEqual([
      ["sara", 1, "divorced", ["k1"]],
      ["maya", 2, "current", ["k2"]],
    ]);
    expect(v.soloChildren.map((c) => c.id)).toEqual(["k3"]);
    expect(v.hasCurrentPartner).toBe(true);
  });

  test("full siblings first, then half-siblings through the father's 2nd marriage", () => {
    expect(v.siblingGroups).toEqual([
      { kind: "full", members: [expect.objectContaining({ id: "rami" })] },
      { kind: "half", via: "father", ordinal: 2, otherParent: expect.objectContaining({ id: "step" }), members: [expect.objectContaining({ id: "lina" })] },
    ]);
  });

  test("unknown person: null", () => {
    expect(familyView("nobody", people, rels)).toBeNull();
  });
});

describe("defaultFamilyFocus", () => {
  test("me when I'm on the tree, otherwise the ancestor with the most descendants", () => {
    expect(defaultFamilyFocus(people, "omar")).toBe("omar");
    expect(defaultFamilyFocus(people, null)).toBe("dad");
    expect(defaultFamilyFocus(people, "stranger")).toBe("dad");
  });
});

describe("halfSiblingHeading", () => {
  test("names the shared parent and their marriage", () => {
    expect(halfSiblingHeading("father", 2, "Omar", "en", true)).toBe("Half-siblings through your father's 2nd marriage");
    expect(halfSiblingHeading("mother", null, "Omar", "en")).toBe("Half-siblings through Omar's mother");
    expect(halfSiblingHeading("father", 2, "عمر", "ar", true)).toBe("إخوة غير أشقاء من الزواج الثاني لـوالدك");
  });
});

describe("marriageLabel", () => {
  test("English and Arabic", () => {
    expect(marriageLabel(1, "widowed", "en")).toBe("1st marriage · widowed");
    expect(marriageLabel(2, "current", "en")).toBe("2nd marriage");
    expect(marriageLabel(2, "divorced", "ar")).toBe("الزواج الثاني · طلاق");
    expect(marriageLabel(null, "divorced", "en")).toBe("divorced");
  });
});
