import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace = vi.fn();
let search = new URLSearchParams("tour=1");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
  useSearchParams: () => search,
}));
vi.mock("next/font/google", () => ({ Nunito: () => ({ className: "nunito", style: { fontFamily: "Nunito" } }) }));

const { WelcomeTour } = await import("./WelcomeTour");

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  replace.mockClear();
  search = new URLSearchParams("tour=1");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const text = () => document.body.textContent ?? "";
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;

describe("WelcomeTour", () => {
  test("opens on ?tour=1 with Big Fat's greeting, walks six steps, then closes and cleans the URL", () => {
    act(() => root.render(<WelcomeTour lang="en" />));
    expect(text()).toContain("Hi! I'm Big Fat. Let me show you around your family tree.");
    expect(text()).not.toMatch(/sprout/i);
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("1");

    act(() => button("Let's go").click());
    expect(text()).toContain("This is your family tree");
    for (let i = 0; i < 4; i++) act(() => button("Next").click());
    expect(text()).toContain("You're all set!");
    act(() => button("Start exploring").click());

    expect(localStorage.getItem("bft.tour.completed")).not.toBeNull();
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
    expect(text()).not.toContain("You're all set!");
  });

  test("does not reopen by itself once completed", () => {
    localStorage.setItem("bft.tour.completed", "1");
    act(() => root.render(<WelcomeTour lang="en" />));
    expect(text()).not.toContain("Big Fat");
  });

  test("Arabic copy", () => {
    act(() => root.render(<WelcomeTour lang="ar" />));
    expect(text()).toContain("مرحبًا! أنا بيغ فات.");
  });
});
