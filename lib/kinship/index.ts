// Relationship finder engine: given two people, find the closest connection
// and name it in English and Arabic.
//
// Search order (first hit wins):
//   1. Blood (incl. adoption): nearest common ancestor, minimising total
//      generations. Gives parent/child, sibling, aunt/uncle, cousin… terms.
//   2. One marriage away: B is the spouse of A's blood relative, or B is a
//      blood relative of A's spouse (in-laws, step-relations, "by marriage").
//   3. Any other route (guardians, godparents, chains of marriages): the
//      shortest path through the whole graph.
//
// Arabic terms are templates where "{A}" is replaced by the first person's
// name (construct state, e.g. "ابن عمّة {A}"), so they compose: a relative of
// your wife is "<term> زوجة {A}".

export type Gender = "m" | "f" | "unknown";

export type KinPerson = {
  id: string;
  gender: Gender;
  father_id: string | null;
  mother_id: string | null;
};

export type KinRelationship = {
  id: string;
  type: "spouse" | "adopted_by" | "raised_by" | "godparent";
  person_a_id: string;
  person_b_id: string;
  status: "current" | "divorced" | "widowed";
};

/** `to` is `from`'s <kind>. */
export type PathLink = {
  from: string;
  to: string;
  kind: "parent" | "child" | "spouse" | "guardian" | "ward" | "godparent" | "godchild";
  adoptive?: boolean;
  /** Set for links stored in `relationships` (spouse, adoption, guardian, godparent). */
  relationshipId?: string;
  /** Spouse links only. */
  status?: KinRelationship["status"];
};

export type Term = { en: string; ar: string };

type Found = {
  path: string[];
  links: PathLink[];
  term: Term;
  /** The nearest shared ancestor(s) on the blood part of the path, e.g. a grandparent couple. */
  sharedAncestors: string[];
  /** Number of links between the two people. */
  distance: number;
};

export type KinResult =
  | { kind: "self"; path: string[]; links: PathLink[]; term: Term }
  | ({ kind: "blood" } & Found)
  | ({ kind: "marriage" } & Found)
  | ({ kind: "connected" } & Found)
  | { kind: "none" };

type Edge = { id: string; link: Omit<PathLink, "from" | "to"> };

export type KinGraph = {
  people: Map<string, KinPerson>;
  /** person → parents (biological via father_id/mother_id, plus adoptive). */
  parents: Map<string, Edge[]>;
  /** person → every neighbour, for the general shortest-path fallback. */
  neighbours: Map<string, Edge[]>;
  spouses: Map<string, Edge[]>;
};

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildKinGraph(people: KinPerson[], relationships: KinRelationship[]): KinGraph {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parents = new Map<string, Edge[]>();
  const neighbours = new Map<string, Edge[]>();
  const spouses = new Map<string, Edge[]>();

  const linkParent = (child: string, parent: string, extra: Partial<PathLink> = {}) => {
    if (!byId.has(child) || !byId.has(parent) || child === parent) return;
    if (parents.get(child)?.some((e) => e.id === parent)) return;
    push(parents, child, { id: parent, link: { kind: "parent", ...extra } });
    push(neighbours, child, { id: parent, link: { kind: "parent", ...extra } });
    push(neighbours, parent, { id: child, link: { kind: "child", ...extra } });
  };

  for (const p of people) {
    if (p.father_id) linkParent(p.id, p.father_id);
    if (p.mother_id) linkParent(p.id, p.mother_id);
  }

  for (const r of relationships) {
    const a = r.person_a_id;
    const b = r.person_b_id;
    if (!byId.has(a) || !byId.has(b) || a === b) continue;
    switch (r.type) {
      case "spouse": {
        const link = { kind: "spouse" as const, relationshipId: r.id, status: r.status };
        push(spouses, a, { id: b, link });
        push(spouses, b, { id: a, link });
        push(neighbours, a, { id: b, link });
        push(neighbours, b, { id: a, link });
        break;
      }
      case "adopted_by": // a = adopted child, b = adoptive parent
        linkParent(a, b, { adoptive: true, relationshipId: r.id });
        break;
      case "raised_by": // a = child, b = guardian
        push(neighbours, a, { id: b, link: { kind: "guardian", relationshipId: r.id } });
        push(neighbours, b, { id: a, link: { kind: "ward", relationshipId: r.id } });
        break;
      case "godparent": // a = godchild, b = godparent
        push(neighbours, a, { id: b, link: { kind: "godparent", relationshipId: r.id } });
        push(neighbours, b, { id: a, link: { kind: "godchild", relationshipId: r.id } });
        break;
    }
  }

  return { people: byId, parents, neighbours, spouses };
}

// ── Words ────────────────────────────────────────────────────────────────

function g(gender: Gender, m: string, f: string, u: string) {
  return gender === "m" ? m : gender === "f" ? f : u;
}

function ordinal(n: number) {
  const words = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  return words[n] ?? `${n}th`;
}

function removedPhrase(n: number) {
  if (n === 0) return "";
  if (n === 1) return " once removed";
  if (n === 2) return " twice removed";
  return ` ${n} times removed`;
}

const greats = (n: number) => "great-".repeat(Math.max(0, n));

/**
 * Fill a template's {A} slot with another phrase. The inner phrase becomes the
 * second noun of an iḍāfa, so it takes the genitive: أخو → أخي ("زوجة أخي {A}").
 */
const nest = (outer: string, inner: string) => outer.replace("{A}", inner.replace(/^أخو /, "أخي "));
const arParentOf = (parent: Gender) => g(parent, "والد {A}", "والدة {A}", "أحد والدَي {A}");
const arSpouseOf = (spouse: Gender) => g(spouse, "زوج {A}", "زوجة {A}", "شريك حياة {A}");

// ── Blood ────────────────────────────────────────────────────────────────

type Climb = Map<string, { depth: number; next: string | null; adoptive: boolean }>;

/** BFS up the parent links. `next` points one step back towards the start. */
function climb(graph: KinGraph, start: string): Climb {
  const seen: Climb = new Map([[start, { depth: 0, next: null, adoptive: false }]]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    const depth = seen.get(id)!.depth;
    for (const e of graph.parents.get(id) ?? []) {
      if (seen.has(e.id)) continue;
      seen.set(e.id, { depth: depth + 1, next: id, adoptive: !!e.link.adoptive });
      queue.push(e.id);
    }
  }
  return seen;
}

/** [start, parent, grandparent, …, ancestor] */
function lineage(c: Climb, ancestor: string): string[] {
  const out: string[] = [];
  for (let id: string | null = ancestor; id; id = c.get(id)!.next) out.unshift(id);
  return out;
}

type BloodMatch = { upA: string[]; upB: string[]; shared: string[]; climbA: Climb; climbB: Climb };

function nearestCommonAncestor(graph: KinGraph, a: string, b: string): BloodMatch | null {
  const climbA = climb(graph, a);
  const climbB = climb(graph, b);
  let best: { id: string; sum: number; skew: number } | null = null;
  for (const [id, { depth: dA }] of climbA) {
    const hit = climbB.get(id);
    if (!hit) continue;
    const sum = dA + hit.depth;
    const skew = Math.abs(dA - hit.depth);
    if (!best || sum < best.sum || (sum === best.sum && skew < best.skew)) best = { id, sum, skew };
  }
  if (!best) return null;
  const dA = climbA.get(best.id)!.depth;
  const dB = climbB.get(best.id)!.depth;
  // Every common ancestor at the same generations (typically a couple).
  const shared = [...climbA.entries()]
    .filter(([id, v]) => v.depth === dA && climbB.get(id)?.depth === dB)
    .map(([id]) => id);
  return { upA: lineage(climbA, best.id), upB: lineage(climbB, best.id), shared, climbA, climbB };
}

/**
 * Name B relative to A, where A climbs dA generations and B climbs dB to the
 * shared ancestor. upA/upB are the lineages ([A, …, ancestor], [B, …, ancestor]).
 */
function bloodTerm(graph: KinGraph, upA: string[], upB: string[], half: boolean): Term {
  const gen = (id: string) => graph.people.get(id)?.gender ?? "unknown";
  const dA = upA.length - 1;
  const dB = upB.length - 1;
  const B = gen(upB[0]);

  if (dA === 0) {
    // B descends from A.
    if (dB === 1) return { en: g(B, "son", "daughter", "child"), ar: g(B, "ابن {A}", "ابنة {A}", "ابن {A}") };
    const en = greats(dB - 2) + g(B, "grandson", "granddaughter", "grandchild");
    if (dB === 2) return { en, ar: g(B, "حفيد {A}", "حفيدة {A}", "حفيد {A}") };
    // Child of a (great-)grandchild: "ابن حفيد {A}"
    return { en, ar: nest(g(B, "ابن {A}", "ابنة {A}", "ابن {A}"), bloodTerm(graph, upA, upB.slice(1), half).ar) };
  }
  if (dB === 0) {
    // B is A's ancestor.
    if (dA === 1) return { en: g(B, "father", "mother", "parent"), ar: g(B, "والد {A}", "والدة {A}", "أحد والدَي {A}") };
    const en = greats(dA - 2) + g(B, "grandfather", "grandmother", "grandparent");
    if (dA === 2) return { en, ar: g(B, "جدّ {A}", "جدّة {A}", "جدّ {A}") };
    // Grandparent of A's parent: "جدّ والد {A}"
    return { en, ar: nest(bloodTerm(graph, upA.slice(1), upB, half).ar, arParentOf(gen(upA[1]))) };
  }
  if (dA === 1 && dB === 1) {
    if (half) {
      return {
        en: g(B, "half-brother", "half-sister", "half-sibling"),
        ar: g(B, "أخو {A} غير الشقيق", "أخت {A} غير الشقيقة", "أخو {A} غير الشقيق"),
      };
    }
    return { en: g(B, "brother", "sister", "sibling"), ar: g(B, "أخو {A}", "أخت {A}", "أخو {A}") };
  }
  if (dA === 1) {
    // B descends from A's sibling S.
    const S = gen(upB[dB - 1]);
    const sib = g(S, "أخي {A}", "أخت {A}", "أخي {A}");
    if (dB === 2) {
      return { en: g(B, "nephew", "niece", "niece/nephew"), ar: g(B, "ابن ", "ابنة ", "ابن ") + sib };
    }
    const en = greats(dB - 3) + g(B, "grandnephew", "grandniece", "grandniece/grandnephew");
    if (dB === 3) return { en, ar: g(B, "حفيد ", "حفيدة ", "حفيد ") + sib };
    return { en, ar: nest(g(B, "ابن {A}", "ابنة {A}", "ابن {A}"), bloodTerm(graph, upA, upB.slice(1), half).ar) };
  }
  if (dB === 1) {
    // B is a sibling of A's ancestor at depth dA-1. Arabic distinguishes the
    // father's side (عمّ/عمّة) from the mother's side (خال/خالة).
    const viaParent = gen(upA[dA - 1]);
    const word =
      viaParent === "f"
        ? g(B, "خال {A}", "خالة {A}", "خال {A}")
        : g(B, "عمّ {A}", "عمّة {A}", "عمّ {A}");
    if (dA === 2) return { en: g(B, "uncle", "aunt", "aunt/uncle"), ar: word };
    const en = greats(dA - 3) + g(B, "great-uncle", "great-aunt", "great-aunt/uncle");
    // Uncle of A's parent: "عمّ والد {A}"
    return { en, ar: nest(bloodTerm(graph, upA.slice(1), upB, half).ar, arParentOf(gen(upA[1]))) };
  }

  // Cousins.
  const degree = Math.min(dA, dB) - 1;
  const en = `${ordinal(degree)} cousin${removedPhrase(Math.abs(dA - dB))}`;
  if (dA === 2 && dB === 2) {
    const parent = gen(upA[1]); // A's parent
    const auntUncle = gen(upB[1]); // B's parent, sibling of A's parent
    const word =
      parent === "f"
        ? g(auntUncle, "خال {A}", "خالة {A}", "خال {A}")
        : g(auntUncle, "عمّ {A}", "عمّة {A}", "عمّ {A}");
    return { en, ar: g(B, "ابن ", "ابنة ", "ابن ") + word };
  }
  if (dA > dB) {
    // B is a cousin of A's parent: "<term> والد {A}"
    return { en, ar: nest(bloodTerm(graph, upA.slice(1), upB, half).ar, arParentOf(gen(upA[1]))) };
  }
  // B is the child of A's cousin: "ابن <term>"
  return { en, ar: nest(g(B, "ابن {A}", "ابنة {A}", "ابن {A}"), bloodTerm(graph, upA, upB.slice(1), half).ar) };
}

function bloodResult(graph: KinGraph, a: string, b: string): Extract<KinResult, { kind: "blood" }> | null {
  const m = nearestCommonAncestor(graph, a, b);
  if (!m) return null;
  const { upA, upB, shared, climbA, climbB } = m;

  // Half siblings: exactly one shared (non-adoptive) parent.
  let half = false;
  if (upA.length === 2 && upB.length === 2) {
    const pa = new Set((graph.parents.get(a) ?? []).filter((e) => !e.link.adoptive).map((e) => e.id));
    const common = (graph.parents.get(b) ?? []).filter((e) => !e.link.adoptive && pa.has(e.id));
    half = common.length === 1 && pa.size > 1;
  }

  const path = [...upA, ...upB.slice(0, -1).reverse()];
  const links: PathLink[] = [];
  for (let i = 0; i < upA.length - 1; i++) {
    links.push({ from: upA[i], to: upA[i + 1], kind: "parent", adoptive: climbA.get(upA[i + 1])!.adoptive });
  }
  for (let i = upB.length - 1; i > 0; i--) {
    links.push({ from: upB[i], to: upB[i - 1], kind: "child", adoptive: climbB.get(upB[i])!.adoptive });
  }
  for (const l of links) {
    if (!l.adoptive) continue;
    const childId = l.kind === "parent" ? l.from : l.to;
    const parentId = l.kind === "parent" ? l.to : l.from;
    l.relationshipId = graph.parents.get(childId)?.find((e) => e.id === parentId)?.link.relationshipId;
  }

  const term = bloodTerm(graph, upA, upB, half);
  if (links.some((l) => l.adoptive)) {
    term.en = `${term.en} (through adoption)`;
    term.ar = `${term.ar} (بالتبنّي)`;
  }
  return { kind: "blood", path, links, term, sharedAncestors: shared, distance: links.length };
}

// ── Marriage ─────────────────────────────────────────────────────────────

function spouseWord(gender: Gender, status: KinRelationship["status"] | undefined) {
  const base = g(gender, "husband", "wife", "spouse");
  return status === "divorced" ? `ex-${base}` : base;
}

function arSpouse(gender: Gender, status: KinRelationship["status"] | undefined) {
  const base = arSpouseOf(gender);
  return status === "divorced" ? base.replace("{A}", "{A} السابق").replace("زوجة {A} السابق", "زوجة {A} السابقة") : base;
}

function marriageResult(graph: KinGraph, a: string, b: string): Extract<KinResult, { kind: "marriage" }> | null {
  const gen = (id: string) => graph.people.get(id)?.gender ?? "unknown";
  const B = gen(b);
  type Candidate = Extract<KinResult, { kind: "marriage" }>;
  const candidates: Candidate[] = [];

  // B is A's spouse.
  for (const s of graph.spouses.get(a) ?? []) {
    if (s.id !== b) continue;
    candidates.push({
      kind: "marriage",
      path: [a, b],
      links: [{ from: a, to: b, ...s.link }],
      term: { en: spouseWord(B, s.link.status), ar: arSpouse(B, s.link.status) },
      sharedAncestors: [],
      distance: 1,
    });
  }

  // B is a blood relative of A's spouse S.
  for (const s of graph.spouses.get(a) ?? []) {
    if (s.id === b) continue;
    const rel = bloodResult(graph, s.id, b);
    if (!rel) continue;
    const S = gen(s.id);
    const dS = rel.links.filter((l) => l.kind === "parent").length; // generations up from S
    const dB = rel.links.length - dS;
    let en: string;
    if (dS === 1 && dB === 0) en = g(B, "father-in-law", "mother-in-law", "parent-in-law");
    else if (dS === 1 && dB === 1) en = g(B, "brother-in-law", "sister-in-law", "sibling-in-law");
    else if (dS === 0 && dB === 1 && !(graph.parents.get(b) ?? []).some((p) => p.id === a))
      en = g(B, "stepson", "stepdaughter", "stepchild");
    else en = `${spouseWord(S, s.link.status)}'s ${rel.term.en}`;
    candidates.push({
      kind: "marriage",
      path: [a, ...rel.path],
      links: [{ from: a, to: s.id, ...s.link }, ...rel.links],
      term: { en, ar: nest(rel.term.ar, arSpouse(S, s.link.status)) },
      sharedAncestors: rel.sharedAncestors,
      distance: rel.distance + 1,
    });
  }

  // B is the spouse of A's blood relative R.
  for (const s of graph.spouses.get(b) ?? []) {
    if (s.id === a) continue;
    const rel = bloodResult(graph, a, s.id);
    if (!rel) continue;
    const dA = rel.links.filter((l) => l.kind === "parent").length;
    const dR = rel.links.length - dA;
    let en: string;
    if (dA === 0 && dR === 1) en = g(B, "son-in-law", "daughter-in-law", "child-in-law");
    else if (dA === 1 && dR === 1) en = g(B, "brother-in-law", "sister-in-law", "sibling-in-law");
    else if (dA === 1 && dR === 0 && !(graph.parents.get(a) ?? []).some((p) => p.id === b))
      en = g(B, "stepfather", "stepmother", "step-parent");
    else if (dA === 2 && dR === 1) en = g(B, "uncle by marriage", "aunt by marriage", "aunt/uncle by marriage");
    else en = `${rel.term.en}'s ${spouseWord(B, s.link.status)}`;
    candidates.push({
      kind: "marriage",
      path: [...rel.path, b],
      links: [...rel.links, { from: s.id, to: b, ...s.link }],
      term: { en, ar: nest(arSpouse(B, s.link.status), rel.term.ar) },
      sharedAncestors: rel.sharedAncestors,
      distance: rel.distance + 1,
    });
  }

  if (!candidates.length) return null;
  // Closest first; prefer current marriages over past ones.
  const pastPenalty = (c: Candidate) => (c.links.some((l) => l.kind === "spouse" && l.status === "divorced") ? 0.5 : 0);
  candidates.sort((x, y) => x.distance + pastPenalty(x) - (y.distance + pastPenalty(y)));
  return candidates[0];
}

// ── Any route ────────────────────────────────────────────────────────────

function shortestPath(graph: KinGraph, a: string, b: string): Extract<KinResult, { kind: "connected" }> | null {
  const prev = new Map<string, { id: string; edge: Edge } | null>([[a, null]]);
  const queue = [a];
  while (queue.length && !prev.has(b)) {
    const id = queue.shift()!;
    for (const e of graph.neighbours.get(id) ?? []) {
      if (prev.has(e.id)) continue;
      prev.set(e.id, { id, edge: e });
      queue.push(e.id);
    }
  }
  if (!prev.has(b)) return null;
  const path: string[] = [];
  const links: PathLink[] = [];
  for (let id = b; ; ) {
    path.unshift(id);
    const p = prev.get(id);
    if (!p) break;
    links.unshift({ from: p.id, to: id, ...p.edge.link });
    id = p.id;
  }
  const n = path.length - 2;
  return {
    kind: "connected",
    path,
    links,
    term: {
      en: n === 1 ? "connected through 1 person" : `connected through ${n} people`,
      ar: n === 1 ? "مرتبط بـ{A} عبر شخص واحد" : `مرتبط بـ{A} عبر ${n} أشخاص`,
    },
    sharedAncestors: [],
    distance: links.length,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/** How is `b` related to `a`? ("Tarek is Omar's first cousin") */
export function findRelationship(graph: KinGraph, a: string, b: string): KinResult {
  if (!graph.people.has(a) || !graph.people.has(b)) return { kind: "none" };
  if (a === b) return { kind: "self", path: [a], links: [], term: { en: "the same person", ar: "الشخص نفسه" } };
  return bloodResult(graph, a, b) ?? marriageResult(graph, a, b) ?? shortestPath(graph, a, b) ?? { kind: "none" };
}

/** Fill a term's Arabic template with A's name. */
export function arabicTerm(term: Term, aName: string) {
  return term.ar.replace("{A}", aName);
}

/** One-line answer, e.g. "Tarek is Omar's first cousin" / "طارق هو ابن عمّة عمر". */
export function describe(
  result: KinResult,
  names: { a: string; b: string },
  genderB: Gender,
): { en: string; ar: string } | null {
  if (result.kind === "none") return null;
  if (result.kind === "self") return { en: `${names.a} is the same person`, ar: `${names.a} هو الشخص نفسه` };
  const pronoun = g(genderB, " هو ", " هي ", " ");
  if (result.kind === "connected") {
    return { en: `${names.b} is ${result.term.en} to ${names.a}`, ar: names.b + " " + arabicTerm(result.term, names.a) };
  }
  return { en: `${names.b} is ${names.a}'s ${result.term.en}`, ar: names.b + pronoun + arabicTerm(result.term, names.a) };
}

/** Label for one step of the path: `link.to` is `link.from`'s <label>. */
export function stepLabel(link: PathLink, toGender: Gender): Term {
  const adopt = link.adoptive;
  switch (link.kind) {
    case "parent":
      return adopt
        ? { en: g(toGender, "adoptive father", "adoptive mother", "adoptive parent"), ar: g(toGender, "الأب بالتبنّي لـ{A}", "الأم بالتبنّي لـ{A}", "الوالد بالتبنّي لـ{A}") }
        : { en: g(toGender, "father", "mother", "parent"), ar: g(toGender, "والد {A}", "والدة {A}", "أحد والدَي {A}") };
    case "child":
      return adopt
        ? { en: g(toGender, "adopted son", "adopted daughter", "adopted child"), ar: g(toGender, "ابن {A} بالتبنّي", "ابنة {A} بالتبنّي", "ابن {A} بالتبنّي") }
        : { en: g(toGender, "son", "daughter", "child"), ar: g(toGender, "ابن {A}", "ابنة {A}", "ابن {A}") };
    case "spouse":
      return { en: spouseWord(toGender, link.status), ar: arSpouse(toGender, link.status) };
    case "guardian":
      return { en: "guardian", ar: g(toGender, "الوصيّ على {A}", "الوصيّة على {A}", "الوصيّ على {A}") };
    case "ward":
      return { en: "child they raised", ar: g(toGender, "ربيب {A}", "ربيبة {A}", "ربيب {A}") };
    case "godparent":
      return { en: g(toGender, "godfather", "godmother", "godparent"), ar: g(toGender, "عرّاب {A}", "عرّابة {A}", "عرّاب {A}") };
    case "godchild":
      return { en: g(toGender, "godson", "goddaughter", "godchild"), ar: g(toGender, "فليون {A}", "فليونة {A}", "فليون {A}") };
  }
}

/** What to light up on the tree for a result. */
export function pathHighlight(result: KinResult) {
  if (result.kind === "none") return { nodeIds: [], parentChild: [], relationshipIds: [] };
  const parentChild: { parentId: string; childId: string }[] = [];
  const relationshipIds: string[] = [];
  for (const l of result.links) {
    if (l.relationshipId) relationshipIds.push(l.relationshipId);
    if ((l.kind === "parent" || l.kind === "child") && !l.adoptive) {
      parentChild.push(l.kind === "parent" ? { parentId: l.to, childId: l.from } : { parentId: l.from, childId: l.to });
    }
  }
  const shared = "sharedAncestors" in result ? result.sharedAncestors : [];
  return { nodeIds: [...new Set([...result.path, ...shared])], parentChild, relationshipIds };
}
