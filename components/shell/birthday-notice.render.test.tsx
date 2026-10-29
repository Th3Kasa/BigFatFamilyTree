import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const person = (id: string, given_en: string, birth_date: string | null, death_date: string | null = null) => ({
  id,
  slug: id,
  given_en,
  given_ar: null,
  family_name_en: "Morkos",
  family_name_ar: null,
  photo_url: null,
  gender: null,
  birth_date,
  death_date,
});

let people: ReturnType<typeof person>[] = [];
vi.mock("@/lib/client/family-directory", () => ({
  useFamilyDirectory: () => ({ people, stories: [] }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { BirthdayNotice } = await import("./BirthdayNotice");

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 8, 9, 0));
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === label)!;

describe("BirthdayNotice", () => {
  test("lists this week's and this month's birthdays, but not people who have died", () => {
    people = [
      person("basem", "Basem", "1998-10-08"),
      person("hanan", "Hanan", "1964-10-20"),
      person("late", "Adly", "1954-10-09", "2000-03-11"),
      person("nodate", "Amir", null),
    ];
    act(() => root.render(<BirthdayNotice lang="en" />));
    expect(text()).toContain("Family birthdays");
    expect(text()).toContain("This week");
    expect(text()).toContain("Basem Morkos");
    expect(text()).toContain("turns 28");
    expect(text()).toContain("Today");
    expect(text()).toContain("Later this month");
    expect(text()).toContain("Hanan Morkos");
    expect(text()).not.toContain("Adly");
    expect(host.querySelector('a[href="/person/basem"]')).not.toBeNull();
  });

  test("minimises to a pill for the rest of the visit, and opens again from it", () => {
    people = [person("basem", "Basem", "1998-10-08")];
    act(() => root.render(<BirthdayNotice lang="en" />));
    act(() => button("Minimise birthdays").click());
    expect(text()).not.toContain("Family birthdays");
    expect(text()).toContain("1 birthday this week");
    expect(sessionStorage.getItem("bft.birthdays.minimised")).toBe("1");

    act(() => button("1 birthday this week").click());
    expect(text()).toContain("Family birthdays");
    expect(sessionStorage.getItem("bft.birthdays.minimised")).toBeNull();
  });

  test("shows nothing when no birthdays are coming up", () => {
    people = [person("amir", "Amir", "1990-03-01")];
    act(() => root.render(<BirthdayNotice lang="en" />));
    expect(host.innerHTML).toBe("");
  });
});
