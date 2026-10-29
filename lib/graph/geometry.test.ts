import { describe, expect, test } from "vitest";
import { coupleLine, laneBetween, soloAnchor } from "./geometry";
import { LANE_STEP, NODE_HEIGHT, NODE_WIDTH } from "./node-size";

describe("coupleLine", () => {
  test("neighbours: a mid-height line, children hang from its middle", () => {
    const line = coupleLine({ x: 0, y: 0 }, { x: 240, y: 0 });
    expect(line.anchor).toEqual({ x: (NODE_WIDTH + 240) / 2, y: NODE_HEIGHT / 2 });
    expect(line.label.placement).toBe("above");
  });

  test("argument order does not matter", () => {
    expect(coupleLine({ x: 240, y: 0 }, { x: 0, y: 0 })).toEqual(coupleLine({ x: 0, y: 0 }, { x: 240, y: 0 }));
  });

  test("a lane runs under the row, one step lower per lane", () => {
    const one = coupleLine({ x: 0, y: 0 }, { x: 480, y: 0 }, 1);
    const two = coupleLine({ x: 0, y: 0 }, { x: 720, y: 0 }, 2);
    expect(one.anchor.y).toBe(NODE_HEIGHT + LANE_STEP);
    expect(two.anchor.y).toBe(NODE_HEIGHT + 2 * LANE_STEP);
    expect(one.label.placement).toBe("below");
  });

  test("solo parent: bottom centre of the card", () => {
    expect(soloAnchor({ x: 10, y: 20 })).toEqual({ x: 10 + NODE_WIDTH / 2, y: 20 + NODE_HEIGHT });
  });
});

describe("laneBetween", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 480, y: 0 };
  test("counts only cards on the same row between the partners", () => {
    expect(laneBetween(a, b, [a, b, { x: 240, y: 0 }, { x: 240, y: 300 }, { x: 900, y: 0 }])).toBe(1);
    expect(laneBetween(a, b, [a, b])).toBe(0);
  });
});
