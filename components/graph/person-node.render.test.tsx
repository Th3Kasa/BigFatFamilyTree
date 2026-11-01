import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { PersonInput } from "@/lib/graph/transform";

vi.mock("@/lib/client/use-focus-person", () => ({ useIsCurrentPerson: () => false }));
const { PersonNode } = await import("./PersonNode");

const person = (id: string, given: string, family: string): PersonInput => ({
  id, slug: id, given_en: given, given_ar: null, family_name_en: family, family_name_ar: null,
  father_id: null, mother_id: null, gender: "f", is_placeholder: false, photo_url: null, pos_x: null, pos_y: null, birth_date: "1964",
});

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

function render(data: Record<string, unknown>) {
  const props = { id: "hanan", data, selected: false, positionAbsoluteX: 0, positionAbsoluteY: 0 } as unknown as NodeProps<never>;
  act(() =>
    root.render(
      <ReactFlowProvider>
        <PersonNode {...props} />
      </ReactFlowProvider>,
    ),
  );
}

describe("Also in another branch, on the real card", () => {
  test("shows the full, underlined link on a cream background and goes to the spouse", () => {
    const onOpenBranch = vi.fn();
    render({ person: person("hanan", "Hanan", "Mansour"), lang: "en", alsoIn: [{ host: person("ezzat", "Ezzat", "Morkos") }], onOpenBranch });
    const link = host.querySelector<HTMLButtonElement>('button[aria-label^="Hanan Mansour: Also in the Morkos branch"]')!;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain("Also in the Morkos branch");
    expect(link.className).toContain("bg-[var(--background)]");
    expect(link.className).not.toContain("truncate");
    expect(link.querySelector(".underline")).not.toBeNull();
    act(() => link.click());
    expect(onOpenBranch).toHaveBeenCalledWith("ezzat");
  });

  test("the dashed copy's link is underlined too", () => {
    render({ person: person("hanan", "Hanan", "Mansour"), lang: "en", refOf: "hanan", onOpenOriginal: vi.fn() });
    expect(host.textContent).toContain("Also in the Mansour branch");
    expect(host.querySelector(".underline")).not.toBeNull();
  });

  test("cards without another branch have no link", () => {
    render({ person: person("sami", "Sami", "Mansour"), lang: "en" });
    expect(host.textContent).not.toContain("Also in");
  });
});
