import { describe, expect, it } from "vitest";
import { makeKinContext, personName, relate, splitEmphasis, stepsText, type ViewPerson } from "./view";
import { matchesQuery, normalizeForSearch, searchPeople } from "./search";
import type { KinRelationship } from "./index";

function p(id: string, given_en: string, o: Partial<ViewPerson> = {}): ViewPerson {
  return {
    id,
    slug: id,
    given_en,
    given_ar: null,
    family_name_en: "Haddad",
    family_name_ar: null,
    photo_url: null,
    is_placeholder: false,
    gender: "unknown",
    father_id: null,
    mother_id: null,
    ...o,
  };
}

const people: ViewPerson[] = [
  p("y", "Youssef", { gender: "m", given_ar: "يوسف" }),
  p("m", "Mariam", { gender: "f", given_ar: "مريم" }),
  p("k", "Khaled", { gender: "m", father_id: "y", mother_id: "m", given_ar: "خالد" }),
  p("s", "Salma", { gender: "f", father_id: "y", mother_id: "m" }),
  p("n", "Nour", { gender: "f" }),
  p("h", "Hani", { gender: "m" }),
  p("o", "Omar", { gender: "m", father_id: "k", mother_id: "n", given_ar: "عمر" }),
  p("t", "Tarek", { gender: "m", father_id: "h", mother_id: "s", given_ar: "طارق" }),
  p("loner", "Loner"),
];
const rels: KinRelationship[] = [
  { id: "r1", type: "spouse", person_a_id: "k", person_b_id: "n", status: "current" },
  { id: "r2", type: "spouse", person_a_id: "s", person_b_id: "h", status: "current" },
];
const ctx = makeKinContext(people, rels);

describe("relate", () => {
  it("is empty until both people are chosen, or when an id is unknown", () => {
    expect(relate(ctx, null, "o").status).toBe("empty");
    expect(relate(ctx, "o", undefined).status).toBe("empty");
    expect(relate(ctx, "o", "not-a-person").status).toBe("empty");
  });

  it("reports the same person picked twice", () => {
    expect(relate(ctx, "o", "o").status).toBe("same");
  });

  it("reports no connection for unrelated people", () => {
    expect(relate(ctx, "o", "loner").status).toBe("none");
  });

  it("answers first cousins in both languages, with the term split out for emphasis", () => {
    const out = relate(ctx, "o", "t");
    if (out.status !== "found") throw new Error("expected a result");
    const { view } = out;
    expect(view.kind).toBe("blood");
    expect(view.distance).toBe(4);
    expect(view.oneLine.en).toBe("Tarek is Omar's first cousin");
    expect(view.headline.en).toEqual({ before: "Tarek is Omar's ", emphasis: "first cousin", after: "" });
    expect(view.oneLine.ar).toContain("طارق");
    expect(view.headline.ar.emphasis).not.toBe("");
    expect(view.headline.ar.before + view.headline.ar.emphasis + view.headline.ar.after).toBe(view.oneLine.ar);
  });

  it("explains a shared-grandparent connection in plain language", () => {
    const out = relate(ctx, "o", "t");
    if (out.status !== "found") throw new Error("expected a result");
    expect(out.view.explanation.en).toBe("They share grandparents Youssef & Mariam.");
    expect(out.view.explanation.ar).toContain("الجدّين");
    expect(out.view.explanation.ar).toContain("يوسف ومريم");
  });

  it("numbers every step on the route and labels each hop from the previous person", () => {
    const out = relate(ctx, "o", "t");
    if (out.status !== "found") throw new Error("expected a result");
    const { steps, highlight } = out.view;
    expect(steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    expect(steps.map((s) => s.personId)).toEqual(highlight.steps);
    expect(steps[0]).toMatchObject({ en: null, ar: null });
    expect(steps[1].en).toBe("Omar's father");
    expect(steps[1].ar).toBe("والد عمر");
  });

  it("names the people in between for marriage routes", () => {
    const out = relate(ctx, "o", "h"); // Hani is the husband of Omar's aunt
    if (out.status !== "found") throw new Error("expected a result");
    expect(out.view.kind).toBe("marriage");
    expect(out.view.explanation.en).toMatch(/^The connection runs through /);
  });

  it("has no explanation when the two people are directly linked", () => {
    const out = relate(ctx, "k", "n");
    if (out.status !== "found") throw new Error("expected a result");
    expect(out.view.explanation).toEqual({ en: null, ar: null });
  });

  it("uses full names when both people share a given name", () => {
    const same = makeKinContext(
      [p("a", "Sam", { gender: "m" }), p("b", "Sam", { gender: "m", family_name_en: "Khoury", father_id: "a" })],
      [],
    );
    const found = relate(same, "a", "b");
    if (found.status !== "found") throw new Error("expected a result");
    expect(found.view.oneLine.en).toBe("Sam Khoury is Sam Haddad's son");
  });
});

describe("text helpers", () => {
  it("splits a sentence around its key term", () => {
    expect(splitEmphasis("Tarek is Omar's first cousin", "first cousin")).toEqual({
      before: "Tarek is Omar's ",
      emphasis: "first cousin",
      after: "",
    });
    expect(splitEmphasis("nothing here", "cousin")).toEqual({ before: "nothing here", emphasis: "", after: "" });
    expect(splitEmphasis("abc", "")).toEqual({ before: "abc", emphasis: "", after: "" });
  });

  it("pluralises step counts, including Arabic number agreement", () => {
    expect(stepsText(1, "en")).toBe("1 step");
    expect(stepsText(4, "en")).toBe("4 steps");
    expect(stepsText(1, "ar")).toBe("خطوة واحدة");
    expect(stepsText(2, "ar")).toBe("خطوتان");
    expect(stepsText(5, "ar")).toBe("5 خطوات");
    expect(stepsText(12, "ar")).toBe("12 خطوة");
  });

  it("labels placeholders and nameless people", () => {
    expect(personName(p("x", "", { is_placeholder: true }), "en")).toBe("Unknown parent");
    expect(personName(p("x", "", { family_name_en: null }), "ar")).toBe("بدون اسم");
    expect(personName(undefined, "en")).toBe("?");
  });
});

describe("people search", () => {
  const list = [
    p("1", "Ahmed", { given_ar: "أحمد" }),
    p("2", "Layla", { given_ar: "ليلى", family_name_ar: "حداد" }),
    p("3", "Ali Ahmed"),
  ];

  it("ignores case, Arabic diacritics and alef/ya/ta-marbuta variants", () => {
    expect(normalizeForSearch("أَحْمَد")).toBe("احمد");
    expect(normalizeForSearch("ليلى")).toBe("ليلي");
    expect(matchesQuery(list[0], "احمد")).toBe(true);
    expect(matchesQuery(list[1], "ليلي")).toBe(true);
    expect(matchesQuery(list[1], "LAYLA Haddad")).toBe(true);
  });

  it("requires every typed word to match", () => {
    expect(matchesQuery(list[2], "ali ahmed")).toBe(true);
    expect(matchesQuery(list[2], "ali omar")).toBe(false);
  });

  it("ranks names that start with the query first and respects the limit", () => {
    expect(searchPeople(list, "ahm").map((x) => x.id)).toEqual(["1", "3"]);
    expect(searchPeople(list, "", 2)).toHaveLength(2);
  });

  // Many people share the family name Mansour; two are called Mansour too.
  const mansours = [
    p("abdala", "Abdala", { family_name_en: "Mansour" }),
    p("galila", "Galila", { family_name_en: "Mansour" }),
    p("mm", "Mansour", { family_name_en: "Mansour" }),
    p("mn", "Mansour", { family_name_en: "Nassif" }),
    p("james", "Nageeb (James)", { family_name_en: "Mansour" }),
    ...Array.from({ length: 60 }, (_, i) => p(`x${i}`, `Zed${i}`, { family_name_en: "Mansour" })),
  ];

  it("needs a different name word for each typed word, so a full name narrows the list", () => {
    expect(searchPeople(mansours, "Mansour Mansour").map((x) => x.id)).toEqual(["mm"]);
    expect(searchPeople(mansours, "mansour mans").map((x) => x.id)).toEqual(["mm"]);
    expect(matchesQuery(mansours[3], "Mansour Mansour")).toBe(false);
  });

  it("puts given-name matches before family-name matches, and returns everyone by default", () => {
    const ids = searchPeople(mansours, "Mansour").map((x) => x.id);
    expect(ids.slice(0, 2)).toEqual(["mm", "mn"]);
    expect(ids).toHaveLength(mansours.length);
    expect(ids.at(-1)).toBe("x59");
  });

  it("splits names on brackets and hyphens", () => {
    expect(searchPeople(mansours, "james").map((x) => x.id)).toEqual(["james"]);
    expect(searchPeople(mansours, "nageeb james mansour").map((x) => x.id)).toEqual(["james"]);
  });
});

describe("generations and what the name means", () => {
  const more = [
    ...people,
    p("z", "Zein", { gender: "f", father_id: "t", given_ar: "زين" }),
    p("w", "Walid", { gender: "m", father_id: "z", given_ar: "وليد" }),
  ];
  const c2 = makeKinContext(more, rels);
  const found = (a: string, b: string) => {
    const out = relate(c2, a, b);
    if (out.status !== "found") throw new Error("expected a result");
    return out.view;
  };

  it("says first cousins share grandparents and are the same generation", () => {
    const v = found("o", "t");
    expect(v.generation).toEqual({ gap: 0, en: "Tarek and Omar are the same generation", ar: "طارق وعمر من الجيل نفسه" });
    expect(v.nameNote?.en).toBe("First cousins share grandparents.");
    expect(v.nameNote?.ar).toContain("«first cousin»");
  });

  it("explains “once removed” and “twice removed” as generations apart", () => {
    const once = found("o", "z");
    expect(once.oneLine.en).toBe("Zein is Omar's first cousin once removed");
    expect(once.generation.en).toBe("Zein is one generation below Omar");
    expect(once.generation.ar).toBe("زين أدنى من عمر بجيل واحد");
    expect(once.nameNote?.en).toBe("First cousins share grandparents. “Once removed” means they are one generation apart.");
    const twice = found("w", "o");
    expect(twice.oneLine.en).toBe("Omar is Walid's first cousin twice removed");
    expect(twice.generation.en).toBe("Omar is two generations above Walid");
    expect(twice.nameNote?.en).toContain("“Twice removed” means they are two generations apart.");
    expect(twice.nameNote?.ar).toContain("فارق جيلين");
  });

  it("labels each step with its generation relative to the first person", () => {
    const v = found("o", "z");
    expect(v.steps.map((s) => s.generation)).toEqual([0, 1, 2, 1, 0, -1]);
    expect(v.steps[0].generationText).toBeNull();
    expect(v.steps[2].generationText).toEqual({ en: "Two generations above Omar", ar: "أعلى من عمر بجيلين" });
    expect(v.steps[4].generationText?.en).toBe("Same generation as Omar");
  });

  it("explains great-aunts and grandnephews through the sibling", () => {
    const v = found("z", "k");
    expect(v.oneLine.en).toBe("Khaled is Zein's great-uncle");
    expect(v.nameNote?.en).toBe("Khaled is a sibling of Salma, a grandparent of Zein.");
  });
});
