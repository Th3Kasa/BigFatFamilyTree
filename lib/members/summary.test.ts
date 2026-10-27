import { describe, expect, it } from "vitest";
import { buildPersonSummary, type PersonRow } from "./summary";

const base: PersonRow = {
  id: "p1",
  slug: "omar-haddad",
  given_en: "Omar",
  given_ar: null,
  family_name_en: "Haddad",
  family_name_ar: null,
  gender: "m",
  birth_date: "1998-04-12",
  father_id: null,
  mother_id: null,
};

describe("buildPersonSummary", () => {
  it("resolves parents from the lookup and the birth year from the text date", () => {
    const parents = new Map([
      ["f1", { given_en: "Elias", given_ar: null }],
      ["m1", { given_en: "Rania", given_ar: "رانيا" }],
    ]);
    const s = buildPersonSummary({ ...base, father_id: "f1", mother_id: "m1" }, parents);
    expect(s.birthYear).toBe(1998);
    expect(s.fatherName).toEqual({ en: "Elias", ar: "Elias" });
    expect(s.motherName).toEqual({ en: "Rania", ar: "رانيا" });
  });

  it("falls back to the stored father-name text when there is no father row", () => {
    const s = buildPersonSummary({ ...base, father_name_en: "Elias" }, new Map());
    expect(s.fatherName).toEqual({ en: "Elias", ar: "Elias" });
    expect(s.motherName).toBeNull();
  });

  it("leaves parents null and year null when unknown", () => {
    const s = buildPersonSummary({ ...base, birth_date: null }, new Map());
    expect(s.birthYear).toBeNull();
    expect(s.fatherName).toBeNull();
  });
});
