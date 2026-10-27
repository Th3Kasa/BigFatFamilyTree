import { describe, it, expect, vi } from "vitest";
import { shell } from "./shell-store";

describe("shell focus requests", () => {
  it("reports false when no canvas is listening", () => {
    expect(shell.requestFocus("p1")).toBe(false);
  });

  it("delivers the id to a mounted canvas and stops after unsubscribe", () => {
    const listener = vi.fn();
    const off = shell.onFocusRequest(listener);
    expect(shell.requestFocus("p2")).toBe(true);
    expect(listener).toHaveBeenCalledWith("p2");
    off();
    expect(shell.requestFocus("p3")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("shell context person", () => {
  it("prefers the open profile over the canvas selection", () => {
    shell.setCanvasPerson({ id: "c", slug: null, name: "Canvas" });
    expect(shell.contextPerson()?.id).toBe("c");
    shell.setPagePerson({ id: "p", slug: "p-slug", name: "Page" });
    expect(shell.contextPerson()?.id).toBe("p");
    shell.setPagePerson(null);
    shell.setCanvasPerson(null);
    expect(shell.contextPerson()).toBeNull();
  });
});
