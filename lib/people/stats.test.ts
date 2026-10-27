import { describe, it, expect } from "vitest";
import { commonFamilyName, countGenerations } from "./stats";

const person = (id: string, over: Partial<Parameters<typeof countGenerations>[0][number]> = {}) => ({
  id,
  father_id: null,
  mother_id: null,
  family_name_en: null,
  family_name_ar: null,
  is_placeholder: false,
  ...over,
});

describe("commonFamilyName", () => {
  it("picks the most frequent family name", () => {
    const people = [
      person("a", { family_name_en: "Haddad" }),
      person("b", { family_name_en: "Haddad" }),
      person("c", { family_name_en: "Saleh" }),
    ];
    expect(commonFamilyName(people, "en")).toBe("Haddad");
  });

  it("uses the active language and ignores placeholders", () => {
    const people = [
      person("a", { family_name_en: "Haddad", family_name_ar: "حداد" }),
      person("b", { family_name_en: "Saleh", is_placeholder: true }),
      person("c", { family_name_en: "Saleh", is_placeholder: true }),
    ];
    expect(commonFamilyName(people, "ar")).toBe("حداد");
  });

  it("returns null when nobody has a family name", () => {
    expect(commonFamilyName([person("a")], "en")).toBeNull();
  });
});

describe("countGenerations", () => {
  it("counts the longest parent chain", () => {
    const people = [
      person("g"),
      person("p", { father_id: "g" }),
      person("c", { mother_id: "p" }),
      person("solo"),
    ];
    expect(countGenerations(people)).toBe(3);
  });

  it("is 0 for an empty tree and survives cycles", () => {
    expect(countGenerations([])).toBe(0);
    const loop = [person("a", { father_id: "b" }), person("b", { father_id: "a" })];
    expect(countGenerations(loop)).toBeGreaterThan(0);
  });
});
