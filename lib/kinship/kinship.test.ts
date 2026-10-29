import { describe as group, it, expect } from "vitest";
import {
  buildKinGraph,
  describe,
  findRelationship,
  pathHighlight,
  stepLabel,
  pathGenerations,
  arabicTerm,
  type Gender,
  type KinPerson,
  type KinRelationship,
} from "./index";

// Youssef ═ Mariam
// ├─ Elias ═ Rania            (Elias also has Hadi with Huda)
// │  ├─ Layla
// │  └─ Omar ─ Zaid ─ Adam
// ├─ Nadia ═ Karim            (Karim raised Fadi)
// │  ├─ Sara
// │  └─ Tarek
// └─ Samir ═ Dina (divorced)  (Samir adopted Noor)
const P = (id: string, gender: Gender, father: string | null = null, mother: string | null = null): KinPerson => ({
  id,
  gender,
  father_id: father,
  mother_id: mother,
});

const people: KinPerson[] = [
  P("youssef", "m"),
  P("mariam", "f"),
  P("elias", "m", "youssef", "mariam"),
  P("rania", "f"),
  P("huda", "f"),
  P("nadia", "f", "youssef", "mariam"),
  P("karim", "m"),
  P("samir", "m", "youssef", "mariam"),
  P("dina", "f"),
  P("layla", "f", "elias", "rania"),
  P("omar", "m", "elias", "rania"),
  P("hadi", "m", "elias", "huda"),
  P("sara", "f", "karim", "nadia"),
  P("tarek", "m", "karim", "nadia"),
  P("zaid", "m", "omar"),
  P("adam", "m", "zaid"),
  P("noor", "f"),
  P("fadi", "m"),
  P("stranger", "unknown"),
];

const R = (id: string, type: KinRelationship["type"], a: string, b: string, status: KinRelationship["status"] = "current"): KinRelationship => ({
  id,
  type,
  person_a_id: a,
  person_b_id: b,
  status,
});

const relationships: KinRelationship[] = [
  R("r-ym", "spouse", "youssef", "mariam"),
  R("r-er", "spouse", "elias", "rania"),
  R("r-nk", "spouse", "nadia", "karim"),
  R("r-sd", "spouse", "samir", "dina", "divorced"),
  R("r-adopt", "adopted_by", "noor", "samir"),
  R("r-raised", "raised_by", "fadi", "karim"),
];

const graph = buildKinGraph(people, relationships);
const rel = (a: string, b: string) => findRelationship(graph, a, b);
const term = (a: string, b: string) => {
  const r = rel(a, b);
  if (r.kind === "none") throw new Error(`no relationship ${a} → ${b}`);
  return { en: r.term.en, ar: arabicTerm(r.term, "X"), kind: r.kind };
};

group("blood relationships", () => {
  it("names parents, children and grandparents", () => {
    expect(term("omar", "elias")).toMatchObject({ en: "father", ar: "والد X" });
    expect(term("elias", "layla")).toMatchObject({ en: "daughter", ar: "ابنة X" });
    expect(term("omar", "youssef")).toMatchObject({ en: "grandfather", ar: "جدّ X" });
    expect(term("youssef", "omar")).toMatchObject({ en: "grandson", ar: "حفيد X" });
    expect(term("zaid", "youssef")).toMatchObject({ en: "great-grandfather", ar: "جدّ والد X" });
    expect(term("youssef", "adam")).toMatchObject({ en: "great-great-grandson", ar: "ابن ابن حفيد X" });
  });

  it("names full and half siblings", () => {
    expect(term("omar", "layla")).toMatchObject({ en: "sister", ar: "أخت X" });
    expect(term("omar", "hadi")).toMatchObject({ en: "half-brother", ar: "أخو X غير الشقيق" });
  });

  it("uses the father's side (عمّ) and mother's side (خال) correctly", () => {
    expect(term("omar", "nadia")).toMatchObject({ en: "aunt", ar: "عمّة X" });
    expect(term("omar", "samir")).toMatchObject({ en: "uncle", ar: "عمّ X" });
    expect(term("sara", "elias")).toMatchObject({ en: "uncle", ar: "خال X" });
    expect(term("tarek", "omar")).toMatchObject({ en: "first cousin", ar: "ابن خال X" });
    expect(term("omar", "tarek")).toMatchObject({ en: "first cousin", ar: "ابن عمّة X" });
    expect(term("tarek", "layla")).toMatchObject({ en: "first cousin", ar: "ابنة خال X" });
  });

  it("names nieces/nephews and cousins once removed", () => {
    expect(term("nadia", "omar")).toMatchObject({ en: "nephew", ar: "ابن أخي X" });
    expect(term("elias", "tarek")).toMatchObject({ en: "nephew", ar: "ابن أخت X" });
    expect(term("zaid", "layla")).toMatchObject({ en: "aunt", ar: "عمّة X" });
    expect(term("zaid", "tarek")).toMatchObject({ en: "first cousin once removed", ar: "ابن عمّة والد X" });
    expect(term("tarek", "zaid")).toMatchObject({ en: "first cousin once removed", ar: "ابن ابن خال X" });
    expect(term("nadia", "zaid")).toMatchObject({ en: "grandnephew", ar: "حفيد أخي X" });
  });

  it("follows adoption and says so", () => {
    expect(term("noor", "samir")).toMatchObject({ en: "father (through adoption)", kind: "blood" });
    expect(term("omar", "noor")).toMatchObject({ en: "first cousin (through adoption)", ar: "ابنة عمّ X (بالتبنّي)" });
  });

  it("returns the path through the shared grandparents", () => {
    const r = rel("omar", "tarek");
    expect(r.kind).toBe("blood");
    if (r.kind !== "blood") return;
    expect(r.path).toEqual(["omar", "elias", "youssef", "nadia", "tarek"]);
    expect(r.sharedAncestors.sort()).toEqual(["mariam", "youssef"]);
    expect(r.distance).toBe(4);
    expect(r.links.map((l) => l.kind)).toEqual(["parent", "parent", "child", "child"]);
  });
});

group("relationships by marriage", () => {
  it("names spouses and ex-spouses", () => {
    expect(term("elias", "rania")).toMatchObject({ en: "wife", ar: "زوجة X", kind: "marriage" });
    expect(term("samir", "dina")).toMatchObject({ en: "ex-wife", ar: "زوجة X السابقة" });
  });

  it("names in-laws and step-relations", () => {
    expect(term("rania", "nadia")).toMatchObject({ en: "sister-in-law", ar: "أخت زوج X" });
    expect(term("nadia", "rania")).toMatchObject({ en: "sister-in-law", ar: "زوجة أخي X" });
    expect(term("youssef", "rania")).toMatchObject({ en: "daughter-in-law", ar: "زوجة ابن X" });
    expect(term("rania", "youssef")).toMatchObject({ en: "father-in-law", ar: "والد زوج X" });
    expect(term("hadi", "rania")).toMatchObject({ en: "stepmother", ar: "زوجة والد X" });
    expect(term("rania", "hadi")).toMatchObject({ en: "stepson" });
  });

  it("names aunts and uncles by marriage", () => {
    expect(term("layla", "karim")).toMatchObject({ en: "uncle by marriage", ar: "زوج عمّة X" });
    expect(term("karim", "layla")).toMatchObject({ en: "niece by marriage", ar: "ابنة أخي زوجة X" });
  });
});

group("other connections", () => {
  it("falls back to the shortest route through guardians", () => {
    const r = rel("karim", "fadi");
    expect(r.kind).toBe("connected");
    const far = rel("layla", "fadi");
    expect(far.kind).toBe("connected");
    if (far.kind === "connected") expect(far.links.at(-1)).toMatchObject({ kind: "ward", relationshipId: "r-raised" });
  });

  it("handles unrelated, unknown and identical people", () => {
    expect(rel("omar", "stranger").kind).toBe("none");
    expect(rel("omar", "nobody").kind).toBe("none");
    expect(rel("omar", "omar").kind).toBe("self");
  });
});

group("presentation helpers", () => {
  it("writes the one-line answer in both languages", () => {
    expect(describe(rel("omar", "tarek"), { a: "Omar", b: "Tarek" }, "m")).toEqual({
      en: "Tarek is Omar's first cousin",
      ar: "Tarek هو ابن عمّة Omar",
    });
  });

  it("labels each step of the path", () => {
    expect(stepLabel({ from: "omar", to: "elias", kind: "parent" }, "m").en).toBe("father");
    expect(stepLabel({ from: "youssef", to: "nadia", kind: "child" }, "f").ar).toBe("ابنة {A}");
  });

  it("lists the nodes and lines to highlight", () => {
    const h = pathHighlight(rel("layla", "karim"));
    expect(new Set(h.nodeIds)).toEqual(new Set(["layla", "elias", "youssef", "mariam", "nadia", "karim"]));
    expect(h.parentChild).toContainEqual({ parentId: "elias", childId: "layla" });
    expect(h.parentChild).toContainEqual({ parentId: "youssef", childId: "nadia" });
    expect(h.relationshipIds).toEqual(["r-nk"]);
  });
});

group("generations, half relations and more in-laws", () => {
  // Extends the family above:
  //   Hadi (Omar's half-brother) has Hiba; Layla has Lina; Lina has Yara.
  //   Tarek marries Salma; Zaid marries Maha; Samir marries Lubna (Omar's stepmother is Huda).
  const more: KinPerson[] = [
    ...people,
    P("hiba", "f", "hadi"),
    P("lina", "f", null, "layla"),
    P("yara", "f", null, "lina"),
    P("salma", "f"),
    P("maha", "f"),
  ];
  const g2 = buildKinGraph(more, [...relationships, R("r-ts", "spouse", "tarek", "salma"), R("r-zm", "spouse", "zaid", "maha")]);
  const t2 = (a: string, b: string) => {
    const r = findRelationship(g2, a, b);
    if (r.kind === "none") throw new Error(`no relationship ${a} → ${b}`);
    return r.term.en;
  };

  it("marks half relations beyond siblings", () => {
    expect(t2("omar", "hiba")).toBe("half-niece");
    expect(t2("hiba", "omar")).toBe("half-uncle");
    expect(t2("hiba", "lina")).toBe("half first cousin");
    expect(t2("hiba", "yara")).toBe("half first cousin once removed");
    // Full relations stay plain.
    expect(t2("hadi", "omar")).toBe("half-brother");
    expect(t2("tarek", "lina")).toBe("first cousin once removed");
  });

  it("counts degree and removal the standard way", () => {
    expect(t2("tarek", "yara")).toBe("first cousin twice removed");
    expect(t2("adam", "tarek")).toBe("first cousin twice removed");
    expect(t2("adam", "yara")).toBe("second cousin");
    expect(t2("adam", "lina")).toBe("first cousin once removed");
    expect(t2("adam", "salma")).toBe("first cousin twice removed's wife");
    expect(t2("youssef", "yara")).toBe("great-great-granddaughter");
    expect(t2("yara", "nadia")).toBe("great-great-aunt");
    expect(t2("lina", "nadia")).toBe("great-aunt");
    expect(t2("adam", "nadia")).toBe("great-great-aunt");
  });

  it("names more in-laws and step-relations", () => {
    expect(t2("salma", "youssef")).toBe("grandfather-in-law");
    expect(t2("youssef", "maha")).toBe("great-granddaughter-in-law");
    expect(t2("omar", "maha")).toBe("daughter-in-law");
    expect(t2("omar", "salma")).toBe("cousin-in-law");
    expect(t2("salma", "omar")).toBe("cousin-in-law");
    expect(t2("nadia", "maha")).toBe("grandnephew's wife");
    expect(t2("elias", "salma")).toBe("niece-in-law");
    expect(t2("salma", "elias")).toBe("uncle-in-law");
    expect(t2("zaid", "karim")).toBe("great-uncle by marriage");
  });

  it("gives every person on the path a generation relative to the first", () => {
    const r = findRelationship(g2, "adam", "tarek");
    if (r.kind === "none" || r.kind === "self") throw new Error("expected a path");
    // adam → zaid → omar → elias → youssef → nadia → tarek
    expect(pathGenerations(r.links)).toEqual([0, 1, 2, 3, 4, 3, 2]);
    const m = findRelationship(g2, "omar", "salma");
    if (m.kind === "none" || m.kind === "self") throw new Error("expected a path");
    expect(pathGenerations(m.links).at(-1)).toBe(0);
  });
});
