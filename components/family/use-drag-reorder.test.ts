import { describe, expect, test } from "vitest";
import { moveItem } from "./use-drag-reorder";

describe("moveItem", () => {
  const list = ["a", "b", "c", "d"];
  test("moves to the top (oldest) and to the bottom (youngest)", () => {
    expect(moveItem(list, 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveItem(list, 0, 3)).toEqual(["b", "c", "d", "a"]);
  });
  test("one place up or down", () => {
    expect(moveItem(list, 1, 0)).toEqual(["b", "a", "c", "d"]);
    expect(moveItem(list, 1, 2)).toEqual(["a", "c", "b", "d"]);
  });
  test("clamps out-of-range targets and ignores a bad source", () => {
    expect(moveItem(list, 1, 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveItem(list, 9, 0)).toEqual(list);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });
});
