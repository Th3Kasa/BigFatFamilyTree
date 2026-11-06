import { describe, expect, test } from "vitest";
import { coupleVine, familyVine, familyVineFromCards, linkVine } from "./vines";
import { coupleLine } from "./geometry";
import { NODE_HEIGHT, NODE_WIDTH } from "./node-size";

const start = { x: 200, y: 100 };
const kids = [
  { id: "a", x: 0, top: 300 },
  { id: "b", x: 200, top: 300 },
  { id: "c", x: 400, top: 300 },
  { id: "d", x: 700, top: 300 },
];

/** Every number an SVG path string contains. */
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("familyVine", () => {
  test("the same line always grows the same vine", () => {
    expect(familyVine(start, kids, "fb-1").art).toEqual(familyVine(start, kids, "fb-1").art);
  });

  test("a different line grows different leaves", () => {
    expect(familyVine(start, kids, "fb-1").art.leaves).not.toEqual(familyVine(start, kids, "fb-2").art.leaves);
  });

  test("it actually has bark and leaves", () => {
    const { art } = familyVine(start, kids, "fb-1");
    expect(art.stems).toMatch(/Z/);
    expect(art.leaves.join("").length).toBeGreaterThan(0);
    expect(art.veins).toMatch(/^M /);
  });

  test("the route to a child reaches exactly that child's top and starts at the parents", () => {
    const vine = familyVine(start, kids, "fb-1");
    for (const k of kids) {
      const n = numbers(vine.routeTo([k.id]));
      expect(n.slice(0, 2)).toEqual([start.x, start.y]);
      expect(n.slice(-2)).toEqual([k.x, k.top]);
    }
  });

  test("a route only follows the limb on its own side", () => {
    const vine = familyVine(start, kids, "fb-1");
    const toLeft = numbers(vine.routeTo(["a"]));
    const xs = toLeft.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThan(start.x + 5);
  });

  test("never produces broken numbers, even when a child sits level with the parents", () => {
    for (const set of [[{ id: "x", x: 200, top: 100 }], [{ id: "x", x: 200, top: 40 }], [{ id: "x", x: 500, top: 100 }], kids]) {
      const { art, routeTo } = familyVine(start, set, "fb-odd");
      const all = [art.stems, ...art.leaves, art.veins, routeTo(set.map((k) => k.id))].join(" ");
      expect(all).not.toMatch(/NaN|Infinity/);
    }
  });

  test("no children: nothing to grow, and it returns straight away", () => {
    const vine = familyVine(start, [], "fb-none");
    expect(vine.art).toEqual({ stems: "", leaves: ["", "", ""], veins: "" });
    expect(vine.routeTo(["x"])).toBe("");
  });

  test("limbs hang clear of tall parents' cards", () => {
    const tall = familyVine({ x: 200, y: 100 }, [{ id: "a", x: 0, top: 400 }], "fb-tall", 240);
    const ys = numbers(tall.routeTo(["a"])).filter((_, i) => i % 2 === 1);
    // The trunk runs down past the cards (y 240) before the limb sets off along y 320.
    expect(ys.some((y) => y > 300 && y < 340)).toBe(true);
  });

  test("hangs from the middle of the couple's line, or under a single parent", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 240, y: 0 };
    const kid = { id: "k", rect: { x: 100, y: 400 }, width: NODE_WIDTH };
    const couple = familyVineFromCards({ a, b, lane: 0 }, [kid], "fb")!;
    const anchor = coupleLine(a, b, 0).anchor;
    expect(numbers(couple.routeTo(["k"])).slice(0, 2)).toEqual([anchor.x, anchor.y]);
    const solo = familyVineFromCards({ a, b: null, lane: 0 }, [kid], "fb")!;
    expect(numbers(solo.routeTo(["k"])).slice(0, 2)).toEqual([NODE_WIDTH / 2, NODE_HEIGHT]);
    expect(familyVineFromCards({ a, b, lane: 0 }, [], "fb")).toBeNull();
  });
});

describe("coupleVine", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 240, y: 0 };

  test("keeps the couple's anchor and label from the shared geometry", () => {
    const vine = coupleVine(a, b, 0, "s-1", true);
    const geo = coupleLine(a, b, 0);
    expect(vine.anchor).toEqual(geo.anchor);
    expect(vine.label).toEqual(geo.label);
  });

  test("a current marriage is twined with leaves; a past one is a single bare line", () => {
    const current = coupleVine(a, b, 0, "s-1", true);
    expect((current.art.stems.match(/Z/g) ?? []).length).toBe(2);
    expect(current.art.leaves.join("").length).toBeGreaterThan(0);
    const past = coupleVine(a, b, 0, "s-1", false);
    expect(past.art).toEqual({ stems: "", leaves: ["", "", ""], veins: "" });
    expect(past.line).toMatch(/^M /);
  });

  test("the line starts and ends at the cards", () => {
    const n = numbers(coupleVine(a, b, 0, "s-1", true).line);
    expect(n.slice(0, 2)).toEqual([NODE_WIDTH, NODE_HEIGHT / 2]);
    expect(n.slice(-2)).toEqual([240, NODE_HEIGHT / 2]);
  });

  test("a low lane stays clean too", () => {
    const vine = coupleVine(a, { x: 720, y: 0 }, 2, "s-2", true);
    expect([vine.line, vine.art.stems].join(" ")).not.toMatch(/NaN|Infinity/);
  });
});

describe("linkVine", () => {
  test("joins exactly the two points it was given", () => {
    const n = numbers(linkVine({ x: 10, y: 20 }, { x: 300, y: 400 }, "adopt-1"));
    expect(n.slice(0, 2)).toEqual([10, 20]);
    expect(n.slice(-2)).toEqual([300, 400]);
  });
});
