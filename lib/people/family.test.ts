import { describe, it, expect } from "vitest";
import { familyOf, kinLabel, type FamilyPerson, type FamilyRelationship } from "./family";

function p(id: string, over: Partial<FamilyPerson> = {}): FamilyPerson {
  return {
    id,
    slug: null,
    given_en: id,
    given_ar: null,
    family_name_en: null,
    family_name_ar: null,
    father_id: null,
    mother_id: null,
    gender: "unknown",
    is_placeholder: false,
    photo_url: null,
    ...over,
  };
}

const people = [
  p("dad", { gender: "m" }),
  p("mum", { gender: "f" }),
  p("me", { gender: "m", father_id: "dad", mother_id: "mum", birth_date: "1990-01-01" }),
  p("sis", { gender: "f", father_id: "dad", mother_id: "mum", birth_date: "1985-01-01" }),
  p("half", { gender: "m", father_id: "dad", mother_id: "other" }),
  p("other", { gender: "f" }),
  p("wife", { gender: "f" }),
  p("ex", { gender: "f" }),
  p("kid", { gender: "f", father_id: "me", mother_id: "wife" }),
  p("ghost", { is_placeholder: true, father_id: "me" }),
  p("foster", { gender: "m" }),
];

const rels: FamilyRelationship[] = [
  { id: "r1", person_a_id: "dad", person_b_id: "mum", type: "spouse", status: "current" },
  { id: "r2", person_a_id: "me", person_b_id: "ex", type: "spouse", status: "divorced", order_index: 1 },
  { id: "r3", person_a_id: "wife", person_b_id: "me", type: "spouse", status: "current", order_index: 2 },
  { id: "r4", person_a_id: "foster", person_b_id: "me", type: "raised_by", status: "current" },
];

describe("familyOf", () => {
  const fam = familyOf("me", people, rels);

  it("finds both parents", () => {
    expect(fam.parents.map((m) => m.person.id).sort()).toEqual(["dad", "mum"]);
    expect(fam.missingParent).toEqual({ father: false, mother: false });
  });

  it("lists current partners before former ones", () => {
    expect(fam.partners.map((m) => [m.person.id, m.kin])).toEqual([
      ["wife", "partner"],
      ["ex", "ex-partner"],
    ]);
  });

  it("lists children and skips placeholders", () => {
    expect(fam.children.map((m) => m.person.id)).toEqual(["kid"]);
  });

  it("separates full and half siblings, oldest first", () => {
    expect(fam.siblings.map((m) => [m.person.id, m.kin])).toEqual([
      ["sis", "sibling"],
      ["half", "half-sibling"],
    ]);
  });

  it("includes guardianship links from either side", () => {
    expect(fam.others).toEqual([expect.objectContaining({ kin: "ward" })]);
    expect(familyOf("foster", people, rels).others).toEqual([expect.objectContaining({ kin: "guardian" })]);
  });

  it("reports missing parents", () => {
    expect(familyOf("dad", people, rels).missingParent).toEqual({ father: true, mother: true });
  });
});

describe("kinLabel", () => {
  it("uses gendered words in both languages", () => {
    const fam = familyOf("me", people, rels);
    expect(kinLabel(fam.partners[0], "en")).toBe("Wife");
    expect(kinLabel(fam.partners[1], "en")).toBe("Ex-wife");
    expect(kinLabel(fam.children[0], "ar")).toBe("ابنة");
    expect(kinLabel(fam.siblings[1], "en")).toBe("Half-brother");
  });
});
