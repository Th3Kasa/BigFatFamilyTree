import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PersonInput } from "@/lib/graph/transform";

const createPersonQuick = vi.fn<(prev: unknown, fd: FormData) => Promise<{ success: boolean; personId?: string }>>(async () => ({ success: true, personId: "new" }));
const linkChild = vi.fn<(p: string, c: string, slot?: string) => Promise<{ success: boolean }>>(async () => ({ success: true }));
const linkParentChild = vi.fn<(p: string, c: string) => Promise<{ success: boolean }>>(async () => ({ success: true }));
const addSibling = vi.fn<(a: string, b: string) => Promise<{ success: boolean }>>(async () => ({ success: true }));
vi.mock("@/lib/actions/people", () => ({
  addSibling: (a: string, b: string) => addSibling(a, b),
  createPersonQuick: (prev: unknown, fd: FormData) => createPersonQuick(prev, fd),
  linkChild: (p: string, c: string, s?: string) => linkChild(p, c, s),
  linkParentChild: (p: string, c: string) => linkParentChild(p, c),
  linkSpouse: vi.fn(async () => ({ success: true })),
  unlinkParent: vi.fn(),
}));
vi.mock("@/lib/actions/relationships", () => ({ deleteRelationship: vi.fn(), updateRelationshipStatus: vi.fn() }));

const { addNewRelative, linkExistingRelative, parentSlots } = await import("./link-actions");

function person(id: string, o: Partial<PersonInput> = {}): PersonInput {
  return {
    id, slug: id, given_en: id, given_ar: null, family_name_en: null, family_name_ar: null,
    father_id: null, mother_id: null, gender: "unknown", is_placeholder: false, photo_url: null, pos_x: null, pos_y: null, ...o,
  };
}
const ezzat = person("ezzat", { gender: "m" });
const hanan = person("hanan", { gender: "f" });
const fields = { given_en: "Basem", given_ar: "باسم", family_name_en: "", family_name_ar: "", gender: "m" as const, birth_date: "" };

beforeEach(() => {
  createPersonQuick.mockClear();
  addSibling.mockClear();
  linkChild.mockClear();
  linkParentChild.mockClear();
});

describe("adding a child to a couple", () => {
  test("from the father: both parents are set in the same insert", async () => {
    await addNewRelative(ezzat, "child", fields, { coParent: hanan });
    const fd = createPersonQuick.mock.calls[0][1];
    expect(fd.get("father_id")).toBe("ezzat");
    expect(fd.get("mother_id")).toBe("hanan");
    expect(fd.get("given_ar")).toBe("باسم");
  });

  test("from the mother: the same result", async () => {
    await addNewRelative(hanan, "child", fields, { coParent: ezzat });
    const fd = createPersonQuick.mock.calls[0][1];
    expect(fd.get("father_id")).toBe("ezzat");
    expect(fd.get("mother_id")).toBe("hanan");
  });

  test("unknown or equal genders: never guess, require an explicit choice", async () => {
    const a = person("a");
    const b = person("b");
    expect(parentSlots(a, b)).toBeNull();
    const refused = await addNewRelative(a, "child", fields, { coParent: b });
    expect(refused.success).toBe(false);
    expect(createPersonQuick).not.toHaveBeenCalled();
    await addNewRelative(a, "child", fields, { coParent: b, fatherId: "b" });
    const fd = createPersonQuick.mock.calls[0][1];
    expect([fd.get("father_id"), fd.get("mother_id")]).toEqual(["b", "a"]);
  });

  test("other parent unknown: only the subject's slot", async () => {
    await addNewRelative(hanan, "child", fields, {});
    const fd = createPersonQuick.mock.calls[0][1];
    expect(fd.get("mother_id")).toBe("hanan");
    expect(fd.get("father_id")).toBeNull();
  });

  test("an existing child is linked to both parents, each in its own slot", async () => {
    await linkExistingRelative(ezzat, "child", person("basem"), { coParent: hanan });
    expect(linkChild.mock.calls).toEqual([
      ["ezzat", "basem", "father_id"],
      ["hanan", "basem", "mother_id"],
    ]);
  });
});

describe("linking the second parent later", () => {
  test("fills the empty mother slot on the child (no new relationship row)", async () => {
    const basem = person("basem", { father_id: "ezzat" });
    await linkExistingRelative(basem, "mother", hanan);
    expect(linkParentChild).toHaveBeenCalledWith("hanan", "basem");
  });
});

describe("adding a sibling", () => {
  test("parents known: the new sibling shares them in the same insert", async () => {
    const basem = person("basem", { father_id: "ezzat", mother_id: "hanan" });
    await addNewRelative(basem, "sibling", { ...fields, given_en: "Amir" });
    const fd = createPersonQuick.mock.calls[0][1];
    expect([fd.get("father_id"), fd.get("mother_id")]).toEqual(["ezzat", "hanan"]);
    expect(addSibling).not.toHaveBeenCalled();
  });

  test("parents unknown: the sibling is still added, linked through an unknown parent", async () => {
    const adel = person("adel");
    const r = await addNewRelative(adel, "sibling", { ...fields, given_en: "Kamal" });
    expect(r.success).toBe(true);
    const fd = createPersonQuick.mock.calls[0][1];
    expect(fd.get("father_id")).toBeNull();
    expect(addSibling).toHaveBeenCalledWith("adel", "new");
  });
});
