import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PersonInput, RelationshipInput } from "@/lib/graph/transform";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/actions/people", () => ({
  addSibling: vi.fn(),
  createPersonQuick: vi.fn(),
  deletePersonCanvas: vi.fn(),
  linkChild: vi.fn(),
  linkParentChild: vi.fn(),
  linkSpouse: vi.fn(),
  unlinkParent: vi.fn(),
  updatePersonPhoto: vi.fn(),
}));
vi.mock("@/lib/actions/relationships", () => ({ deleteRelationship: vi.fn(), updateRelationshipStatus: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

const { FamilyHub } = await import("./FamilyHub");
const { FamilyView } = await import("./FamilyView");

function person(id: string, o: Partial<PersonInput> = {}): PersonInput {
  return {
    id, slug: id, given_en: id[0].toUpperCase() + id.slice(1), given_ar: null, family_name_en: "Haddad", family_name_ar: null,
    father_id: null, mother_id: null, gender: "unknown", is_placeholder: false, photo_url: null, pos_x: null, pos_y: null, ...o,
  };
}
const people = [
  person("elias", { gender: "m" }), person("step", { gender: "f" }),
  person("omar", { gender: "m", father_id: "elias" }),
  person("lina", { gender: "f", father_id: "elias", mother_id: "step" }),
  person("maya", { gender: "f" }),
  person("sara", { father_id: "omar", mother_id: "maya", gender: "f" }),
];
const rels: RelationshipInput[] = [
  { id: "r1", person_a_id: "elias", person_b_id: "step", type: "spouse", status: "current", order_index: 2 },
  { id: "r2", person_a_id: "omar", person_b_id: "maya", type: "spouse", status: "current", order_index: 1 },
];

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((q: string) => ({ matches: q.includes("min-width"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const hubProps = {
  person: people[2],
  slot: null,
  slotNonce: 1,
  people,
  relationships: rels,
  lang: "en" as const,
  meId: "omar",
  onClose: () => {},
  onShowPerson: () => {},
};

describe("FamilyHub", () => {
  test("editors see the family with slots to add missing relatives", () => {
    act(() => root.render(<FamilyHub {...hubProps} canEdit />));
    const text = host.textContent ?? "";
    expect(text).toContain("Omar's family");
    expect(text).toContain("Add mother");
    expect(text).toContain("Maya Haddad");
    expect(text).toContain("Half-siblings through your father");
    expect(host.querySelectorAll('button[aria-label^="Options for"]').length).toBeGreaterThan(0);
  });

  test("viewers get a read-only panel", () => {
    act(() => root.render(<FamilyHub {...hubProps} canEdit={false} />));
    const text = host.textContent ?? "";
    expect(text).toContain("Mother not recorded");
    expect(text).not.toContain("Add mother");
    expect(host.querySelectorAll('button[aria-label^="Options for"]')).toHaveLength(0);
  });

  test("opening at a slot shows the add flow with a confirm that spells out the result", () => {
    act(() => root.render(<FamilyHub {...hubProps} slot="partner" canEdit />));
    expect(host.textContent).toContain("Add Omar's partner");
    const input = host.querySelector<HTMLInputElement>('input[lang="en"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Rana");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector('button[type="submit"]')?.textContent).toBe("Add Rana as Omar's wife");
  });

  test("Arabic renders right to left", () => {
    act(() => root.render(<FamilyHub {...hubProps} lang="ar" canEdit />));
    expect(host.querySelector("aside")?.getAttribute("dir")).toBe("rtl");
    expect(host.textContent).toContain("عائلة Omar");
  });
});

describe("FamilyView", () => {
  test("shows parents, marriages with their children, half-siblings, and editor slots", () => {
    act(() =>
      root.render(
        <FamilyView
          focusId="omar"
          trail={["elias", "omar"]}
          people={people}
          relationships={rels}
          lang="en"
          canEdit
          meId="omar"
          onFocus={() => {}}
          onOpenHub={() => {}}
          onShowOnTree={() => {}}
        />,
      ),
    );
    const text = host.textContent ?? "";
    expect(text).toContain("That's you");
    expect(text).toContain("Dad's other marriage (1 child)");
    expect(text).toContain("Their child");
    expect(text).toContain("Half-siblings through your father's 1st marriage");
    expect(text).toContain("Add mother");
    expect(host.querySelector('nav [aria-current="page"]')?.textContent).toBe("Omar");
  });
});
