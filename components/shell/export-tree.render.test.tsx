import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PersonInput } from "@/lib/graph/transform";
import type { TreeExportData } from "@/lib/actions/tree-export";

vi.mock("@/lib/actions/tree-export", () => ({ loadTreeForExport: vi.fn(async () => ({ ok: true, people: [], relationships: [] })) }));

const { CurrentPersonProvider } = await import("@/components/providers/current-person-provider");
const { ExportTreeButton } = await import("./ExportTreeButton");
const { TreeExportDialog } = await import("./TreeExportDialog");

const me = { id: "p1", slug: null, given_en: "Rami", given_ar: null, family_name_en: null, family_name_ar: null, photo_url: null };
const person = (id: string): PersonInput => ({
  id, slug: id, given_en: id, given_ar: null, family_name_en: null, family_name_ar: null, father_id: null, mother_id: null, gender: "m", is_placeholder: false, photo_url: null, pos_x: null, pos_y: null,
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
  document.body.innerHTML = "";
});

/** The dialog renders in a portal, so look across the whole document. */
const page = () => document.body.textContent ?? "";
const radios = () => [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name);

async function openDialog(lang: "ar" | "en", load: () => Promise<TreeExportData>) {
  await act(async () => {
    root.render(<TreeExportDialog lang={lang} onClose={() => {}} load={load} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("ExportTreeButton", () => {
  test("a linked member sees it", () => {
    act(() =>
      root.render(
        <CurrentPersonProvider person={me}>
          <ExportTreeButton lang="en" />
        </CurrentPersonProvider>,
      ),
    );
    expect(buttonNamed("Download PDF of the family tree")).toBeTruthy();
  });

  test("an account not linked to the tree doesn't", () => {
    act(() =>
      root.render(
        <CurrentPersonProvider person={null}>
          <ExportTreeButton lang="en" />
        </CurrentPersonProvider>,
      ),
    );
    expect(document.querySelector("button")).toBeNull();
  });
});

describe("TreeExportDialog", () => {
  test("offers A3 to A0, says how readable each is, and picks the best fit", async () => {
    await openDialog("en", async () => ({ ok: true, people: [person("a"), person("b")], relationships: [] }));
    expect(radios().map((r) => r.value)).toEqual(["A3", "A2", "A1", "A0"]);
    expect(page()).toContain("Best fit");
    expect(page()).toContain("Names read easily");
    // Two people fit easily on the smallest sheet, so that's the one chosen.
    expect(radios().find((r) => r.checked)?.value).toBe("A3");
    expect(buttonNamed("Download A3 PDF")).toBeTruthy();

    await act(async () => radios()[3].click());
    expect(buttonNamed("Download A0 PDF")).toBeTruthy();
  });

  test("an unlinked account is told how to get access, with no retry", async () => {
    await openDialog("en", async () => ({ ok: false, reason: "not-linked" }));
    expect(page()).toContain("Ask an admin to link your account");
    expect(buttonNamed("Try again")).toBeUndefined();
  });

  test("a failed load can be retried", async () => {
    const load = vi.fn<() => Promise<TreeExportData>>();
    load.mockResolvedValueOnce({ ok: false, reason: "failed" });
    load.mockResolvedValueOnce({ ok: true, people: [person("a")], relationships: [] });
    await openDialog("en", load);
    const retry = buttonNamed("Try again");
    expect(retry).toBeTruthy();
    await act(async () => retry!.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(radios()).toHaveLength(4);
  });

  test("an empty tree says so instead of offering a blank poster", async () => {
    await openDialog("en", async () => ({ ok: true, people: [], relationships: [] }));
    expect(page()).toContain("no one on the tree yet");
    expect(radios()).toHaveLength(0);
  });

  test("speaks Arabic", async () => {
    await openDialog("ar", async () => ({ ok: true, people: [person("a")], relationships: [] }));
    expect(page()).toContain("حجم الورق");
  });
});
