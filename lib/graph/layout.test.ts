import { describe, expect, test } from "vitest";
import { buildGraphElements, type GraphEdge, type GraphNode, type PersonInput, type RelationshipInput } from "./transform";
import { layoutFamily, nudgeFor, resolvePositions, ROW_HEIGHT } from "./layout";
import { NODE_HEIGHT, NODE_WIDTH } from "./node-size";

// ── fixtures ────────────────────────────────────────────────────────────────
function person(id: string, o: Partial<PersonInput> = {}): PersonInput {
  return {
    id, slug: id, given_en: id, given_ar: null, family_name_en: null, family_name_ar: null,
    father_id: null, mother_id: null, gender: "unknown", is_placeholder: false, photo_url: null,
    pos_x: null, pos_y: null, ...o,
  };
}
const m = (id: string, o: Partial<PersonInput> = {}) => person(id, { gender: "m", ...o });
const f = (id: string, o: Partial<PersonInput> = {}) => person(id, { gender: "f", ...o });
const kid = (id: string, father: string | null, mother: string | null, o: Partial<PersonInput> = {}) =>
  person(id, { father_id: father, mother_id: mother, ...o });
function married(id: string, a: string, b: string, status: RelationshipInput["status"] = "current", order_index = 1): RelationshipInput {
  return { id, person_a_id: a, person_b_id: b, type: "spouse", status, order_index };
}

// ── assertions ──────────────────────────────────────────────────────────────
function absolute(nodes: GraphNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return nodes.map((n) => {
    const parent = n.parentId ? byId.get(n.parentId)! : null;
    return { id: n.id, refOf: n.data.refOf, x: n.position.x + (parent?.position.x ?? 0), y: n.position.y + (parent?.position.y ?? 0) };
  });
}

function expectNoOverlaps(nodes: GraphNode[]) {
  const rects = absolute(nodes);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlap = a.x < b.x + NODE_WIDTH && b.x < a.x + NODE_WIDTH && a.y < b.y + NODE_HEIGHT && b.y < a.y + NODE_HEIGHT;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

function expectChildrenOnTheirUnion(people: PersonInput[], edges: GraphEdge[]) {
  const branches = edges.filter((e) => e.data?.edgeKind === "family-branch");
  for (const p of people) {
    if (!p.father_id && !p.mother_id) continue;
    const mine = branches.filter((b) => b.data?.childIds?.includes(p.id));
    expect(mine, `${p.id} hangs from exactly one bracket`).toHaveLength(1);
    expect(mine[0].data?.fatherId ?? null).toBe(p.father_id);
    expect(mine[0].data?.motherId ?? null).toBe(p.mother_id);
  }
}

const refs = (nodes: GraphNode[]) => nodes.filter((n) => n.type === "personRef");
const branchOf = (edges: GraphEdge[], childId: string) =>
  edges.find((e) => e.data?.edgeKind === "family-branch" && e.data.childIds?.includes(childId))!;
const xOf = (nodes: GraphNode[], id: string) => absolute(nodes).find((n) => n.id === id)!.x;

// ── scenarios ───────────────────────────────────────────────────────────────
describe("widowed, then remarried, with children from both marriages", () => {
  const people = [
    m("gpa"), f("gma"),
    m("hani", { father_id: "gpa", mother_id: "gma" }),
    f("wife1"), f("wife2"),
    kid("k1", "hani", "wife1", { birth_date: "1990" }),
    kid("k2", "hani", "wife1", { birth_date: "1992" }),
    kid("k3", "hani", "wife2", { birth_date: "2001" }),
  ];
  const rels = [married("g", "gpa", "gma"), married("r1", "hani", "wife1", "widowed", 1), married("r2", "hani", "wife2", "current", 2)];
  const { nodes, edges } = buildGraphElements(people, rels, "en");

  test("no overlaps, no reference cards", () => {
    expectNoOverlaps(nodes);
    expect(refs(nodes)).toHaveLength(0);
  });

  test("earlier wife on the left, current wife on the right", () => {
    expect(xOf(nodes, "wife1")).toBeLessThan(xOf(nodes, "hani"));
    expect(xOf(nodes, "wife2")).toBeGreaterThan(xOf(nodes, "hani"));
  });

  test("each marriage's children hang from that couple's line and stay grouped", () => {
    expectChildrenOnTheirUnion(people, edges);
    expect(branchOf(edges, "k1").data?.partnerNodeIds).toEqual(["wife1", "hani"]);
    expect(branchOf(edges, "k3").data?.partnerNodeIds).toEqual(["hani", "wife2"]);
    expect(Math.max(xOf(nodes, "k1"), xOf(nodes, "k2"))).toBeLessThan(xOf(nodes, "k3"));
  });

  test("marriages are labelled in order", () => {
    const s = edges.filter((e) => e.data?.edgeKind === "spouse" && e.data.personIds?.includes("hani"));
    expect(s.find((e) => e.data?.relationshipId === "r1")?.data?.ordinal).toBe(1);
    expect(s.find((e) => e.data?.relationshipId === "r2")?.data?.ordinal).toBe(2);
    expect(s.every((e) => e.data?.lane === 0)).toBe(true);
  });
});

describe("widowed, then remarried to the late husband's brother", () => {
  const people = [
    m("gpa"), f("gma"),
    m("h1", { father_id: "gpa", mother_id: "gma", birth_date: "1960" }),
    m("h2", { father_id: "gpa", mother_id: "gma", birth_date: "1963" }),
    f("wife"),
    kid("a", "h1", "wife"),
    kid("b", "h2", "wife"),
  ];
  const rels = [married("g", "gpa", "gma"), married("r1", "h1", "wife", "widowed", 1), married("r2", "h2", "wife", "current", 2)];
  const { nodes, edges } = buildGraphElements(people, rels, "en");

  test("she sits once (beside her first husband) and appears as a reference card beside the second", () => {
    expectNoOverlaps(nodes);
    const r = refs(nodes);
    expect(r).toHaveLength(1);
    expect(r[0].data.refOf).toBe("wife");
    expect(r[0].parentId).toBe("h2");
  });

  test("the second marriage's child hangs from the reference card's line, not a cross-tree edge", () => {
    expectChildrenOnTheirUnion(people, edges);
    const ref = refs(nodes)[0].id;
    expect(branchOf(edges, "b").data?.partnerNodeIds).toContain(ref);
    const second = edges.find((e) => e.data?.relationshipId === "r2")!;
    expect([second.source, second.target].sort()).toEqual(["h2", ref].sort());
    expect(second.data?.lane).toBe(0);
  });
});

describe("divorced, then remarried to the first wife's sister (both born into the tree)", () => {
  const people = [
    m("g1"), f("g2"), m("g3"), f("g4"),
    m("sami", { father_id: "g1", mother_id: "g2" }),
    f("rana", { father_id: "g3", mother_id: "g4", birth_date: "1970" }),
    f("dina", { father_id: "g3", mother_id: "g4", birth_date: "1973" }),
    kid("x", "sami", "rana"),
    kid("y", "sami", "dina"),
  ];
  const rels = [
    married("ga", "g1", "g2"), married("gb", "g3", "g4"),
    married("r1", "sami", "rana", "divorced", 1), married("r2", "sami", "dina", "current", 2),
  ];
  const { nodes, edges } = buildGraphElements(people, rels, "en");

  test("both sisters stay in their birth family, with reference cards beside the husband", () => {
    expectNoOverlaps(nodes);
    const r = refs(nodes);
    expect(r.map((n) => n.data.refOf).sort()).toEqual(["dina", "rana"]);
    expect(r.every((n) => n.parentId === "sami")).toBe(true);
    const [refRana, refDina] = ["rana", "dina"].map((id) => r.find((n) => n.data.refOf === id)!.id);
    expect(xOf(nodes, refRana)).toBeLessThan(xOf(nodes, "sami"));
    expect(xOf(nodes, refDina)).toBeGreaterThan(xOf(nodes, "sami"));
  });

  test("children attach to the right marriage", () => {
    expectChildrenOnTheirUnion(people, edges);
  });

  test("the two families share a generation row", () => {
    const y = (id: string) => absolute(nodes).find((n) => n.id === id)!.y;
    expect(y("sami")).toBe(y("rana"));
  });
});

describe("first-cousin marriage", () => {
  const people = [
    m("gpa"), f("gma"),
    m("son", { father_id: "gpa", mother_id: "gma" }), f("sonWife"),
    f("daughter", { father_id: "gpa", mother_id: "gma" }), m("daughterHusband"),
    m("adam", { father_id: "son", mother_id: "sonWife" }),
    f("bella", { father_id: "daughterHusband", mother_id: "daughter" }),
    kid("baby", "adam", "bella"),
  ];
  const rels = [
    married("g", "gpa", "gma"), married("s", "son", "sonWife"), married("d", "daughterHusband", "daughter"),
    married("ab", "adam", "bella"),
  ];
  const { nodes, edges } = buildGraphElements(people, rels, "en");

  test("one reference card, beside the husband, and no long cross-tree line", () => {
    expectNoOverlaps(nodes);
    const r = refs(nodes);
    expect(r).toHaveLength(1);
    expect(r[0].data.refOf).toBe("bella");
    expect(r[0].parentId).toBe("adam");
    const ab = edges.find((e) => e.data?.relationshipId === "ab")!;
    expect([ab.source, ab.target]).toContain(r[0].id);
    expect(Math.abs(xOf(nodes, ab.source) - xOf(nodes, ab.target))).toBeLessThan(NODE_WIDTH * 2);
  });

  test("their child hangs from the couple", () => {
    expectChildrenOnTheirUnion(people, edges);
    expect(branchOf(edges, "baby").data?.partnerNodeIds).toEqual(["adam", refs(nodes)[0].id]);
  });
});

describe("three marriages", () => {
  const people = [
    m("gpa"), f("gma"),
    m("omar", { father_id: "gpa", mother_id: "gma" }),
    f("w1"), f("w2"), f("w3"),
    kid("c1", "omar", "w1"), kid("c2", "omar", "w2"), kid("c3", "omar", "w3"),
  ];
  const rels = [
    married("g", "gpa", "gma"),
    married("r1", "omar", "w1", "divorced", 1), married("r2", "omar", "w2", "widowed", 2), married("r3", "omar", "w3", "current", 3),
  ];
  const { nodes, edges } = buildGraphElements(people, rels, "en");

  test("past wives chain on the left (earliest furthest out), current on the right", () => {
    expectNoOverlaps(nodes);
    expect(refs(nodes)).toHaveLength(0);
    const order = ["w1", "w2", "omar", "w3"].map((id) => xOf(nodes, id));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("the non-neighbouring first marriage runs in its own lane under the row", () => {
    const lane = (rid: string) => edges.find((e) => e.data?.relationshipId === rid)!.data?.lane;
    expect(lane("r1")).toBe(1);
    expect(lane("r2")).toBe(0);
    expect(lane("r3")).toBe(0);
  });

  test("each child hangs from its own mother's marriage", () => {
    expectChildrenOnTheirUnion(people, edges);
    expect(branchOf(edges, "c1").data?.partnerNodeIds).toEqual(["w1", "omar"]);
    expect(xOf(nodes, "c1")).toBeLessThan(xOf(nodes, "c2"));
    expect(xOf(nodes, "c2")).toBeLessThan(xOf(nodes, "c3"));
  });
});

describe("a larger sample tree", () => {
  // Four generations, several couples each with married-in partners and children.
  const people: PersonInput[] = [m("g1"), f("g2")];
  const rels: RelationshipInput[] = [married("rg", "g1", "g2")];
  for (let i = 0; i < 4; i++) {
    people.push(m(`c${i}`, { father_id: "g1", mother_id: "g2", birth_date: `196${i}` }), f(`cw${i}`));
    rels.push(married(`rc${i}`, `c${i}`, `cw${i}`));
    for (let j = 0; j < 3; j++) {
      people.push(m(`gc${i}${j}`, { father_id: `c${i}`, mother_id: `cw${i}`, birth_date: `199${j}` }), f(`gw${i}${j}`));
      rels.push(married(`rgc${i}${j}`, `gc${i}${j}`, `gw${i}${j}`));
      people.push(kid(`ggc${i}${j}`, `gc${i}${j}`, `gw${i}${j}`));
    }
  }
  people.push(person("loner"));

  test("layoutFamily places every person and no two cards overlap", () => {
    const pos = layoutFamily(people, rels).positions;
    expect(pos.size).toBe(people.length);
    const { nodes } = buildGraphElements(people.map((p) => ({ ...p, pos_x: pos.get(p.id)!.x, pos_y: pos.get(p.id)!.y })), rels, "en");
    expectNoOverlaps(nodes);
  });

  test("buildGraphElements with no saved positions has no overlaps", () => {
    expectNoOverlaps(buildGraphElements(people, rels, "en").nodes);
  });
});

// ── generation rows, couples side by side, manual nudges ────────────────────
function yOf(nodes: GraphNode[], id: string) {
  return absolute(nodes).find((n) => n.id === id)!.y;
}

/** Every child below its parents, every couple on one row with nobody between them. */
function expectTidyRows(people: PersonInput[], nodes: GraphNode[], edges: GraphEdge[]) {
  const abs = absolute(nodes);
  for (const p of people) {
    for (const parent of [p.father_id, p.mother_id]) {
      if (!parent) continue;
      // Below the parent as drawn beside the couple: their own card or a reference card of them.
      const parentY = Math.min(...abs.filter((n) => n.id === parent || n.refOf === parent).map((n) => n.y));
      expect(yOf(nodes, p.id), `${p.id} below ${parent}`).toBeGreaterThan(parentY);
    }
  }
  for (const e of edges.filter((x) => x.data?.edgeKind === "spouse" && (x.data.lane ?? 0) === 0)) {
    const a = abs.find((n) => n.id === e.source)!;
    const b = abs.find((n) => n.id === e.target)!;
    expect(a.y, `${e.id} on one row`).toBe(b.y);
    const between = abs.filter((n) => n.y === a.y && n.x > Math.min(a.x, b.x) && n.x < Math.max(a.x, b.x));
    expect(between.map((n) => n.id), `${e.id} has nobody between the partners`).toEqual([]);
  }
}

describe("a brother and sister, each married (the Malak family)", () => {
  const people = [
    m("p1"), f("p2"),
    m("nadir", { father_id: "p1", mother_id: "p2", birth_date: "1980" }),
    f("muna", { father_id: "p1", mother_id: "p2", birth_date: "1983" }),
    f("reem"),
    m("w1"), f("w2"),
    m("waleed", { father_id: "w1", mother_id: "w2" }),
  ];
  const rels = [
    married("rp", "p1", "p2"), married("rw", "w1", "w2"),
    married("rn", "nadir", "reem"), married("rm", "waleed", "muna"),
  ];
  const { nodes, edges } = buildGraphElements(people, rels, "en");

  test("each spouse line joins neighbouring cards on the same row", () => {
    expectNoOverlaps(nodes);
    expectTidyRows(people, nodes, edges);
  });

  test("Reem sits beside Nadir; Muna appears beside Waleed as a reference card", () => {
    expect(Math.abs(xOf(nodes, "reem") - xOf(nodes, "nadir"))).toBeLessThan(NODE_WIDTH * 2);
    const ref = refs(nodes);
    expect(ref).toHaveLength(1);
    expect(ref[0].data.refOf).toBe("muna");
    expect(ref[0].parentId).toBe("waleed");
  });

  test("Muna's own card is not between Nadir and Reem", () => {
    const [lo, hi] = [xOf(nodes, "nadir"), xOf(nodes, "reem")].sort((a, b) => a - b);
    const muna = xOf(nodes, "muna");
    expect(muna < lo || muna > hi).toBe(true);
  });
});

describe("generations", () => {
  test("rows by generation: oldest at the top, children strictly below, in-laws on their spouse's row", () => {
    const people = [
      m("g1"), f("g2"),
      m("a", { father_id: "g1", mother_id: "g2" }), f("aw"),
      m("b", { father_id: "a", mother_id: "aw" }), f("bw"),
      kid("c", "b", "bw"),
    ];
    const rels = [married("r1", "g1", "g2"), married("r2", "a", "aw"), married("r3", "b", "bw")];
    const { nodes, edges } = buildGraphElements(people, rels, "en");
    expectTidyRows(people, nodes, edges);
    expect(["g1", "a", "b", "c"].map((id) => yOf(nodes, id))).toEqual([0, 1, 2, 3].map((g) => g * ROW_HEIGHT));
    expect(yOf(nodes, "bw")).toBe(yOf(nodes, "b"));
  });

  test("a child sits one row below where its parents are drawn, even if a parent's own row is deeper", () => {
    // Dad is generation 1; Mum is generation 2 in her own family (both born into the tree),
    // so the couple is drawn in Dad's row with a reference card of Mum.
    const people = [
      m("g1"), f("g2"), m("h1"), f("h2"),
      m("dad", { father_id: "g1", mother_id: "g2" }),
      m("mid", { father_id: "h1", mother_id: "h2" }), f("midw"),
      f("mum", { father_id: "mid", mother_id: "midw" }),
      kid("kid", "dad", "mum"),
    ];
    const rels = [married("a", "g1", "g2"), married("b", "h1", "h2"), married("c", "mid", "midw"), married("d", "dad", "mum")];
    const { nodes, edges } = buildGraphElements(people, rels, "en");
    expectNoOverlaps(nodes);
    expectTidyRows(people, nodes, edges);
    expect(yOf(nodes, "kid")).toBe(2 * ROW_HEIGHT);
  });
});

describe("saved positions", () => {
  const people = [
    m("p1"), f("p2"),
    m("a", { father_id: "p1", mother_id: "p2" }), f("aw"),
    m("b", { father_id: "p1", mother_id: "p2" }), f("bw"),
    kid("c", "a", "aw"), kid("d", "b", "bw"),
  ];
  const rels = [married("r1", "p1", "p2"), married("r2", "a", "aw"), married("r3", "b", "bw")];

  test("old absolute positions (from the previous layout) are ignored", () => {
    const legacy = people.map((p) => ({ ...p, pos_x: 0, pos_y: 0 }));
    const { nodes, edges } = buildGraphElements(legacy, rels, "en");
    expectNoOverlaps(nodes);
    expectTidyRows(legacy, nodes, edges);
  });

  test("a manual nudge moves the whole couple sideways, within its row", () => {
    const base = buildGraphElements(people, rels, "en").nodes;
    const nudged = people.map((p) => (p.id === "b" ? { ...p, pos_x: 300, pos_y: null } : p));
    const { nodes, edges } = buildGraphElements(nudged, rels, "en");
    expect(xOf(nodes, "b") - xOf(base, "b")).toBe(300);
    expect(xOf(nodes, "bw") - xOf(base, "bw")).toBe(300);
    expect(yOf(nodes, "b")).toBe(yOf(base, "b"));
    expectTidyRows(nudged, nodes, edges);
  });

  test("adversarial nudges and saved positions never make cards overlap or split a couple", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 25; round++) {
      const wild = people.map((p) => {
        const r = rand();
        if (r < 0.33) return { ...p, pos_x: Math.round((rand() - 0.5) * 2000), pos_y: null };
        if (r < 0.66) return { ...p, pos_x: Math.round(rand() * 50), pos_y: Math.round(rand() * 50) };
        return p;
      });
      const { nodes, edges } = buildGraphElements(wild, rels, "en");
      expectNoOverlaps(nodes);
      expectTidyRows(wild, nodes, edges);
    }
  });

  test("a drop becomes an offset that reproduces the drop", () => {
    const base = buildGraphElements(people, rels, "en").nodes;
    // Drag Bob's wife 250px to the right: the offset lands on the couple's first card.
    const nudge = nudgeFor("bw", xOf(base, "bw") + 250, people, rels)!;
    expect(nudge.offset).toBe(250);
    const saved = people.map((p) => (p.id === nudge.personId ? { ...p, pos_x: nudge.offset, pos_y: null } : p));
    const after = buildGraphElements(saved, rels, "en").nodes;
    expect(xOf(after, "bw")).toBe(xOf(base, "bw") + 250);
    expect(xOf(after, "b")).toBe(xOf(base, "b") + 250);
  });

  test("resolvePositions reports a row per generation", () => {
    expect(resolvePositions(people, rels).rows.map((r) => r.generation)).toEqual([0, 1, 2]);
  });
});


describe("birth order set by hand", () => {
  // Nassif & Victoria's sons, no birth dates; Samuel is the eldest by hand.
  const base = [
    m("nassif"), f("victoria"),
    kid("adel", "nassif", "victoria"),
    kid("fouad", "nassif", "victoria"),
    kid("samuel", "nassif", "victoria"),
    f("samwife"),
    kid("samkid1", "samuel", "samwife"),
    kid("samkid2", "samuel", "samwife"),
  ];
  const rels = [married("r0", "nassif", "victoria"), married("r1", "samuel", "samwife")];
  const order = (o: Record<string, number>) => base.map((p) => (p.id in o ? { ...p, birth_order: o[p.id] } : p));

  test("without an order, siblings fall back to name", () => {
    const pos = layoutFamily(base, rels).positions;
    expect(pos.get("adel")!.x).toBeLessThan(pos.get("fouad")!.x);
    expect(pos.get("fouad")!.x).toBeLessThan(pos.get("samuel")!.x);
  });

  test("the oldest's whole branch (partner and children) moves to the left of their siblings", () => {
    const pos = layoutFamily(order({ samuel: 1, adel: 2, fouad: 3 }), rels).positions;
    const branch = ["samuel", "samwife", "samkid1", "samkid2"].map((id) => pos.get(id)!.x);
    expect(Math.max(...branch)).toBeLessThan(pos.get("adel")!.x);
    expect(pos.get("adel")!.x).toBeLessThan(pos.get("fouad")!.x);
  });

  test("a set order beats birth dates, and people without one come after", () => {
    const people = order({ fouad: 1 }).map((p) => (p.id === "adel" ? { ...p, birth_date: "1930" } : p));
    const pos = layoutFamily(people, rels).positions;
    expect(pos.get("fouad")!.x).toBeLessThan(pos.get("adel")!.x);
    expect(pos.get("adel")!.x).toBeLessThan(pos.get("samuel")!.x);
  });

  test("the reordered tree never overlaps", () => {
    expectNoOverlaps(buildGraphElements(order({ samuel: 1, fouad: 2, adel: 3 }), rels, "en").nodes);
  });
});
