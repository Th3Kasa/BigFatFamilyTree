import { describe, it, expect } from "vitest";
import {
  inferParents,
  type PersonRow,
  type RelationshipRow,
} from "./inferParents";

function p(id: string, overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id,
    given_en: id,
    given_ar: null,
    family_name_en: null,
    family_name_ar: null,
    father_id: null,
    mother_id: null,
    gender: null,
    is_placeholder: false,
    ...overrides,
  };
}

function spouse(
  a: string,
  b: string,
  status: RelationshipRow["status"] = "current",
): RelationshipRow {
  return { person_a_id: a, person_b_id: b, type: "spouse", status };
}

describe("inferParents", () => {
  it("returns both recorded when father_id and mother_id are set", () => {
    const child = { id: "c", father_id: "f", mother_id: "m" };
    const people = [p("c"), p("f", { gender: "m" }), p("m", { gender: "f" })];
    const rels: RelationshipRow[] = [];

    const out = inferParents(child, people, rels);

    expect(out.father).toEqual({
      kind: "recorded",
      personId: "f",
      person: people[1],
    });
    expect(out.mother).toEqual({
      kind: "recorded",
      personId: "m",
      person: people[2],
    });
  });

  it("infers mother from father's single current spouse", () => {
    const child = { id: "c", father_id: "f", mother_id: null };
    const people = [p("c"), p("f", { gender: "m" }), p("m", { gender: "f" })];
    const rels = [spouse("f", "m", "current")];

    const out = inferParents(child, people, rels);

    expect(out.father.kind).toBe("recorded");
    expect(out.mother).toEqual({
      kind: "inferred",
      personId: "m",
      person: people[2],
      sourceSpouseOf: "f",
    });
  });

  it("marks mother as not-recorded when father has zero current spouses", () => {
    const child = { id: "c", father_id: "f", mother_id: null };
    const people = [p("c"), p("f", { gender: "m" })];
    const rels: RelationshipRow[] = [];

    const out = inferParents(child, people, rels);

    expect(out.father.kind).toBe("recorded");
    expect(out.mother).toEqual({ kind: "not-recorded", expectedGender: "f" });
  });

  it("does NOT infer when father has more than one current spouse", () => {
    const child = { id: "c", father_id: "f", mother_id: null };
    const people = [
      p("c"),
      p("f", { gender: "m" }),
      p("w1", { gender: "f" }),
      p("w2", { gender: "f" }),
    ];
    const rels = [spouse("f", "w1", "current"), spouse("f", "w2", "current")];

    const out = inferParents(child, people, rels);

    expect(out.father.kind).toBe("recorded");
    expect(out.mother).toEqual({ kind: "not-recorded", expectedGender: "f" });
  });

  it("ignores divorced/widowed spouses when inferring", () => {
    const child = { id: "c", father_id: "f", mother_id: null };
    const people = [
      p("c"),
      p("f", { gender: "m" }),
      p("ex", { gender: "f" }),
      p("now", { gender: "f" }),
    ];
    const rels = [
      spouse("f", "ex", "divorced"),
      spouse("f", "now", "current"),
    ];

    const out = inferParents(child, people, rels);

    expect(out.mother.kind).toBe("inferred");
    if (out.mother.kind === "inferred") {
      expect(out.mother.personId).toBe("now");
    }
  });

  it("mirrors: infers father from mother's single current spouse", () => {
    const child = { id: "c", father_id: null, mother_id: "m" };
    const people = [p("c"), p("m", { gender: "f" }), p("f", { gender: "m" })];
    const rels = [spouse("m", "f", "current")];

    const out = inferParents(child, people, rels);

    expect(out.mother.kind).toBe("recorded");
    expect(out.father).toEqual({
      kind: "inferred",
      personId: "f",
      person: people[2],
      sourceSpouseOf: "m",
    });
  });
});
