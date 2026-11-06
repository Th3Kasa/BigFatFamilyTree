import { beforeEach, describe, expect, test, vi } from "vitest";

const getUser = vi.fn();
const fetchCurrentPerson = vi.fn();
const tables: Record<string, { data: unknown; error: { message: string } | null }> = {};
const from = vi.fn((table: string) => {
  const result = tables[table];
  const query = {
    select: () => query,
    is: () => query,
    order: () => query,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/members/current-person", () => ({ fetchCurrentPerson: (...a: unknown[]) => fetchCurrentPerson(...a) }));
vi.mock("@/lib/people/birth-order", () => ({
  fetchBirthOrders: async () => new Map(),
  withBirthOrder: <T,>(rows: T[]) => rows,
}));
vi.mock("@/lib/storage/photos", () => ({ withSignedPhotos: async <T,>(_: unknown, rows: T[]) => rows }));

import { loadTreeForExport } from "./tree-export";

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  fetchCurrentPerson.mockResolvedValue({ id: "p1" });
  tables.people = { data: [{ id: "p1" }], error: null };
  tables.relationships = { data: [{ id: "r1" }], error: null };
});

describe("loadTreeForExport", () => {
  test("a signed-out visitor gets nothing, and no family data is even asked for", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "not-linked" });
    expect(from).not.toHaveBeenCalled();
  });

  test("an account not linked to the tree gets nothing, and no family data is even asked for", async () => {
    fetchCurrentPerson.mockResolvedValue(null);
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "not-linked" });
    expect(from).not.toHaveBeenCalled();
  });

  test("a linked member gets everyone on the tree", async () => {
    expect(await loadTreeForExport()).toEqual({ ok: true, people: [{ id: "p1" }], relationships: [{ id: "r1" }] });
  });

  test("a database failure is reported, never shown as an empty tree", async () => {
    tables.people = { data: null, error: { message: "boom" } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "failed" });
    spy.mockRestore();
  });
});
