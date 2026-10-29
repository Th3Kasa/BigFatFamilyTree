// View-model for the relationship finder: turns an engine result into the text
// and highlight the UI renders (headline, Arabic line, explanation, steps).
// Pure and bilingual, so the home-page banner, the finder page and the tests
// all share one source of truth.

import { toPathHighlight, type PathHighlight } from "@/lib/graph/highlight";
import { getNameParts } from "@/lib/utils";
import {
  arabicTerm,
  buildKinGraph,
  describe,
  findRelationship,
  pathGenerations,
  stepLabel,
  type Gender,
  type KinGraph,
  type KinPerson,
  type KinRelationship,
  type KinResult,
} from "./index";

export type Lang = "ar" | "en";

export type ViewPerson = KinPerson & {
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  photo_url: string | null;
  is_placeholder: boolean;
};

export type KinContext = { graph: KinGraph; byId: Map<string, ViewPerson> };

export function makeKinContext(people: ViewPerson[], relationships: KinRelationship[]): KinContext {
  return { graph: buildKinGraph(people, relationships), byId: new Map(people.map((p) => [p.id, p])) };
}

/** A sentence split around its key term so the UI can emphasise it. */
export type Segments = { before: string; emphasis: string; after: string };

export type StepView = {
  personId: string;
  /** 1-based; matches the badge on the tree. */
  number: number;
  /** "Khaled's father" — how this person relates to the previous one. Null for the first person. */
  en: string | null;
  ar: string | null;
  /** Generations from the first person: +1 = a parent's generation, -1 = a child's. */
  generation: number;
  /** "1 generation above Omar". Null for the first person. */
  generationText: { en: string; ar: string } | null;
};

export type RelationshipView = {
  kind: "blood" | "marriage" | "connected";
  /** Number of steps (links) between the two people. */
  distance: number;
  headline: { en: Segments; ar: Segments };
  /** The answer as one plain sentence, for the banner and screen readers. */
  oneLine: { en: string; ar: string };
  explanation: { en: string | null; ar: string | null };
  /** B's generation relative to A, as a number and a sentence. */
  generation: { gap: number; en: string; ar: string };
  /** What the name means: "First cousins share grandparents. “Once removed” means…". */
  nameNote: { en: string; ar: string } | null;
  steps: StepView[];
  highlight: PathHighlight;
};

export type RelationOutcome =
  | { status: "empty" }
  | { status: "same" }
  | { status: "none" }
  | { status: "found"; view: RelationshipView };

// ── Names ────────────────────────────────────────────────────────────────

const UNKNOWN_PARENT: Record<Lang, string> = { en: "Unknown parent", ar: "والد غير معروف" };
const UNNAMED: Record<Lang, string> = { en: "Unnamed", ar: "بدون اسم" };

export function personName(p: ViewPerson | undefined, lang: Lang, full = false): string {
  if (!p) return "?";
  if (p.is_placeholder) return UNKNOWN_PARENT[lang];
  const { given, family } = getNameParts(p, lang);
  if (!given && !family) return UNNAMED[lang];
  return full ? [given, family].filter(Boolean).join(" ") : given || family;
}

/** Given names, unless both people share one — then full names so the sentence is unambiguous. */
function namePair(a: ViewPerson, b: ViewPerson, lang: Lang): { a: string; b: string } {
  const short = { a: personName(a, lang), b: personName(b, lang) };
  if (short.a.toLowerCase() !== short.b.toLowerCase()) return short;
  return { a: personName(a, lang, true), b: personName(b, lang, true) };
}

function joinNames(names: string[], lang: Lang): string {
  if (names.length <= 1) return names[0] ?? "";
  if (lang === "ar") {
    const last = names[names.length - 1];
    return `${names.slice(0, -1).join("، ")} و${last}`;
  }
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// ── Text helpers ─────────────────────────────────────────────────────────

/** "5 steps" / "خمس خطوات" style label with correct Arabic number agreement. */
export function stepsText(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "1 step" : `${n} steps`;
  if (n === 1) return "خطوة واحدة";
  if (n === 2) return "خطوتان";
  return n <= 10 ? `${n} خطوات` : `${n} خطوة`;
}

/** Splits `text` around the last occurrence of `term`; no match → no emphasis. */
export function splitEmphasis(text: string, term: string): Segments {
  const i = term ? text.lastIndexOf(term) : -1;
  if (i < 0) return { before: text, emphasis: "", after: "" };
  return { before: text.slice(0, i), emphasis: term, after: text.slice(i + term.length) };
}

function ancestorWord(up: number, count: number, gender: Gender): { en: string; ar: string } {
  const pick = (m: string, f: string, u: string) => (gender === "m" ? m : gender === "f" ? f : u);
  if (count > 1) {
    if (up === 1) return { en: "parents", ar: "الوالدين" };
    if (up === 2) return { en: "grandparents", ar: "الجدّين" };
    if (up === 3) return { en: "great-grandparents", ar: "الأجداد" };
    return { en: "ancestors", ar: "الأجداد" };
  }
  if (up === 1) return { en: pick("father", "mother", "parent"), ar: pick("الأب", "الأم", "الوالد") };
  if (up === 2) return { en: pick("grandfather", "grandmother", "grandparent"), ar: pick("الجدّ", "الجدّة", "الجدّ") };
  if (up === 3) return { en: pick("great-grandfather", "great-grandmother", "great-grandparent"), ar: pick("الجدّ الأعلى", "الجدّة العليا", "الجدّ الأعلى") };
  return { en: "ancestor", ar: "الجدّ الأعلى" };
}

// ── Generations ──────────────────────────────────────────────────────────

const EN_COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const enCount = (n: number) => EN_COUNT[n] ?? String(n);
const enGenerations = (n: number) => `${enCount(n)} generation${n === 1 ? "" : "s"}`;
/** "جيل واحد" / "جيلين" / "3 أجيال" / "11 جيلًا". */
function arGenerations(n: number): string {
  if (n === 1) return "جيل واحد";
  if (n === 2) return "جيلين";
  return n <= 10 ? `${n} أجيال` : `${n} جيلًا`;
}

/** Where someone sits relative to `a`: "1 generation above Omar" / "أعلى من عمر بجيل واحد". */
export function generationText(gap: number, a: { en: string; ar: string }): { en: string; ar: string } {
  if (gap === 0) return { en: `Same generation as ${a.en}`, ar: `من جيل ${a.ar} نفسه` };
  const n = Math.abs(gap);
  const ar = n === 1 ? "بجيل واحد" : n === 2 ? "بجيلين" : `بـ${arGenerations(n)}`;
  return gap > 0
    ? { en: `${enGenerations(n)} above ${a.en}`.replace(/^./, (c) => c.toUpperCase()), ar: `أعلى من ${a.ar} ${ar}` }
    : { en: `${enGenerations(n)} below ${a.en}`.replace(/^./, (c) => c.toUpperCase()), ar: `أدنى من ${a.ar} ${ar}` };
}

/** "Tarek is one generation below Zaid" / "طارق أدنى من زيد بجيل واحد". */
function generationSentence(gap: number, a: { en: string; ar: string }, b: { en: string; ar: string }): { en: string; ar: string } {
  if (gap === 0) return { en: `${b.en} and ${a.en} are the same generation`, ar: `${b.ar} و${a.ar} من الجيل نفسه` };
  const t = generationText(gap, a);
  return { en: `${b.en} is ${t.en.charAt(0).toLowerCase()}${t.en.slice(1)}`, ar: `${b.ar} ${t.ar}` };
}

const ORDINAL_EN = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

/**
 * Why the relationship has the name it has. Cousins: the degree comes from the
 * shared ancestor (first cousins share grandparents, second cousins
 * great-grandparents…) and "removed" counts the generations between them.
 * Half relations: the two lines meet at half siblings.
 */
function nameNote(
  result: Exclude<KinResult, { kind: "none" | "self" }>,
  ctx: KinContext,
): RelationshipView["nameNote"] {
  if (result.kind !== "blood") return null;
  const up = result.links.findIndex((l) => l.kind !== "parent");
  if (up <= 0) return null; // direct descendants: the name says it all
  const down = result.links.length - up;
  const en: string[] = [];
  const ar: string[] = [];

  if (up >= 2 && down >= 2) {
    const degree = Math.min(up, down) - 1;
    const removed = Math.abs(up - down);
    const shared = degree === 1 ? "grandparents" : `${"great-".repeat(degree - 1)}grandparents`;
    en.push(`${ORDINAL_EN[degree] ?? `${degree}th`} cousins share ${shared}.`);
    if (removed > 0) {
      const word = removed === 1 ? "Once removed" : removed === 2 ? "Twice removed" : `${removed} times removed`;
      en.push(`“${word}” means they are ${enGenerations(removed)} apart.`);
      ar.push(`بينهما فارق ${arGenerations(removed)}، ولذلك يُقال بالإنجليزية «${result.term.en}».`);
    } else {
      ar.push(`${degree === 1 ? "يتشاركان في الجدّين" : "يتشاركان في الأجداد أنفسهم"}، ولذلك يُقال بالإنجليزية «${result.term.en}».`);
    }
  } else if (down === 0 || up === 0) {
    return null;
  } else if (Math.max(up, down) >= 3) {
    // Great-aunts/uncles and grandnieces/nephews: say which generation the sibling sits in.
    const older = up > down ? result.path[up - 1] : result.path[up + 1];
    const enWho = (k: number) => (k === 1 ? "a parent" : k === 2 ? "a grandparent" : `a ${"great-".repeat(k - 2)}grandparent`);
    if (up > down) {
      en.push(`${personName(ctx.byId.get(result.path.at(-1)!), "en")} is a sibling of ${personName(ctx.byId.get(older), "en")}, ${enWho(up - 1)} of ${personName(ctx.byId.get(result.path[0]), "en")}.`);
      ar.push(`${personName(ctx.byId.get(result.path.at(-1)!), "ar")} من إخوة ${personName(ctx.byId.get(older), "ar")}، و${personName(ctx.byId.get(older), "ar")} ${generationText(up - 1, { en: "", ar: personName(ctx.byId.get(result.path[0]), "ar") }).ar}.`);
    } else {
      en.push(`${personName(ctx.byId.get(result.path[0]), "en")} is a sibling of ${personName(ctx.byId.get(older), "en")}, ${enWho(down - 1)} of ${personName(ctx.byId.get(result.path.at(-1)!), "en")}.`);
      ar.push(`${personName(ctx.byId.get(result.path[0]), "ar")} من إخوة ${personName(ctx.byId.get(older), "ar")}، و${personName(ctx.byId.get(older), "ar")} ${generationText(down - 1, { en: "", ar: personName(ctx.byId.get(result.path.at(-1)!), "ar") }).ar}.`);
    }
  }

  if (result.half) {
    const x = result.path[up - 1];
    const y = result.path[up + 1];
    const n = (id: string, lang: Lang) => personName(ctx.byId.get(id), lang);
    en.push(`“Half” because ${n(x, "en")} and ${n(y, "en")} have only one parent in common.`);
    ar.push(`${n(x, "ar")} و${n(y, "ar")} يشتركان في والد واحد فقط (غير أشقّاء).`);
  }

  return en.length ? { en: en.join(" "), ar: ar.join(" ") } : null;
}

function explain(result: Exclude<KinResult, { kind: "none" | "self" }>, ctx: KinContext): RelationshipView["explanation"] {
  const names = (ids: string[], lang: Lang) => joinNames(ids.map((id) => personName(ctx.byId.get(id), lang)), lang);

  // Blood relatives who climb to a common ancestor on both sides.
  if (result.kind === "blood") {
    const up = result.links.findIndex((l) => l.kind !== "parent");
    const down = up < 0 ? 0 : result.links.length - up;
    if (up > 0 && down > 0 && result.sharedAncestors.length > 0) {
      const ids = result.sharedAncestors;
      if (up === down) {
        const w = ancestorWord(up, ids.length, ctx.byId.get(ids[0])?.gender ?? "unknown");
        return {
          en: `They share ${w.en} ${names(ids, "en")}.`,
          ar: `يتشاركان في ${w.ar} ${names(ids, "ar")}.`,
        };
      }
      return {
        en: `They both descend from ${names(ids, "en")}.`,
        ar: `ينحدران من ${names(ids, "ar")}.`,
      };
    }
  }

  // Everything else: name the people in between.
  const between = result.path.slice(1, -1);
  if (between.length === 0) return { en: null, ar: null };
  return {
    en: `The connection runs through ${names(between, "en")}.`,
    ar: `تمرّ الصلة عبر ${names(between, "ar")}.`,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/** Answer "how is B related to A?" for the UI. Unknown ids count as an empty pick. */
export function relate(ctx: KinContext, aId: string | null | undefined, bId: string | null | undefined): RelationOutcome {
  const a = aId ? ctx.byId.get(aId) : undefined;
  const b = bId ? ctx.byId.get(bId) : undefined;
  if (!a || !b) return { status: "empty" };
  if (a.id === b.id) return { status: "same" };

  const result = findRelationship(ctx.graph, a.id, b.id);
  if (result.kind === "none" || result.kind === "self") return { status: "none" };

  const en = namePair(a, b, "en");
  const ar = namePair(a, b, "ar");
  const oneLine = {
    en: describe(result, { a: en.a, b: en.b }, b.gender)!.en,
    ar: describe(result, { a: ar.a, b: ar.b }, b.gender)!.ar,
  };

  const gens = pathGenerations(result.links);
  const aNames = { en: personName(a, "en"), ar: personName(a, "ar") };
  const steps: StepView[] = result.path.map((id, i) => {
    if (i === 0) return { personId: id, number: 1, en: null, ar: null, generation: 0, generationText: null };
    const from = ctx.byId.get(result.path[i - 1]);
    const to = ctx.byId.get(id);
    const label = stepLabel(result.links[i - 1], to?.gender ?? "unknown");
    return {
      personId: id,
      number: i + 1,
      en: `${personName(from, "en")}'s ${label.en}`,
      ar: arabicTerm(label, personName(from, "ar")),
      generation: gens[i],
      generationText: generationText(gens[i], aNames),
    };
  });
  const gap = gens[gens.length - 1];

  return {
    status: "found",
    view: {
      kind: result.kind,
      distance: result.distance,
      headline: {
        en: splitEmphasis(oneLine.en, result.term.en),
        ar: splitEmphasis(oneLine.ar, arabicTerm(result.term, ar.a)),
      },
      oneLine,
      explanation: explain(result, ctx),
      generation: { gap, ...generationSentence(gap, { en: en.a, ar: ar.a }, { en: en.b, ar: ar.b }) },
      nameNote: nameNote(result, ctx),
      steps,
      highlight: toPathHighlight(result),
    },
  };
}
