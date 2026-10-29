import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let transform: [number, number, number] = [0, 0, 1];
vi.mock("@xyflow/react", () => ({
  useStore: (sel: (s: { transform: [number, number, number]; height: number }) => unknown) => sel({ transform, height: 2000 }),
}));

const { GenerationRail } = await import("./GenerationRail");

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows = [
  { index: 0, count: 4, collapsed: false, centerY: 64 },
  { index: 1, count: 14, collapsed: true, centerY: 276 },
  { index: 2, count: 22, collapsed: false, centerY: 400 },
];

describe("GenerationRail", () => {
  test("a button per generation; minimised ones say how many are hidden; clicking toggles", () => {
    transform = [0, 100, 1];
    const onToggle = vi.fn();
    act(() => root.render(<GenerationRail rows={rows} lang="en" onToggle={onToggle} />));
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Minimise generation 1 (4 people)",
      "Show generation 2 (14 people)",
      "Minimise generation 3 (22 people)",
    ]);
    expect(buttons[1].getAttribute("aria-expanded")).toBe("false");
    expect(buttons[1].textContent).toContain("14 hidden");
    act(() => buttons[1].click());
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  test("zoomed out, the buttons stack in a list instead of following the rows", () => {
    transform = [0, 0, 0.1];
    act(() => root.render(<GenerationRail rows={rows} lang="ar" onToggle={() => {}} />));
    const nav = host.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("الأجيال");
    expect(nav.querySelectorAll("button")).toHaveLength(3);
    expect(nav.querySelector("button")!.style.position).toBe("");
  });
});
