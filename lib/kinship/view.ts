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
};

export type RelationshipView = {
  kind: "blood" | "marriage" | "connected";
  /** Number of steps (links) between the two people. */
  distance: number;
  headline: { en: Segments; ar: Segments };
  /** The answer as one plain sentence, for the banner and screen readers. */
  oneLine: { en: string; ar: string };
  explanation: { en: string | null; ar: string | null };
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

  const steps: StepView[] = result.path.map((id, i) => {
    if (i === 0) return { personId: id, number: 1, en: null, ar: null };
    const from = ctx.byId.get(result.path[i - 1]);
    const to = ctx.byId.get(id);
    const label = stepLabel(result.links[i - 1], to?.gender ?? "unknown");
    return {
      personId: id,
      number: i + 1,
      en: `${personName(from, "en")}'s ${label.en}`,
      ar: arabicTerm(label, personName(from, "ar")),
    };
  });

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
      steps,
      highlight: toPathHighlight(result),
    },
  };
}
