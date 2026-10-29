import { describe, expect, test } from "vitest";
import { resolveViewportIntent } from "./viewport";

const nodeIds = ["a", "b", "c", "me"];

describe("resolveViewportIntent", () => {
  test("default: fit the whole tree", () => {
    expect(resolveViewportIntent({ nodeIds })).toEqual({ kind: "fit-all" });
  });

  test("being linked does not move the default", () => {
    expect(resolveViewportIntent({ nodeIds, centerOnMeId: null })).toEqual({ kind: "fit-all" });
  });

  test("?focus= goes to that person", () => {
    expect(resolveViewportIntent({ nodeIds, focusId: "b" })).toEqual({ kind: "node", id: "b", reason: "focus" });
  });

  test("a relationship path wins over focus", () => {
    expect(resolveViewportIntent({ nodeIds, focusId: "b", pathIds: ["a", "c"] })).toEqual({ kind: "path", ids: ["a", "c"] });
  });

  test("Center on me goes to the current person", () => {
    expect(resolveViewportIntent({ nodeIds, centerOnMeId: "me" })).toEqual({ kind: "node", id: "me", reason: "me" });
  });

  test("ids that aren't on the tree are ignored", () => {
    expect(resolveViewportIntent({ nodeIds, focusId: "ghost", pathIds: ["nobody"], centerOnMeId: "x" })).toEqual({ kind: "fit-all" });
  });
});
