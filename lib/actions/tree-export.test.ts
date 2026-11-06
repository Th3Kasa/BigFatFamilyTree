import { beforeEach, describe, expect, test, vi } from "vitest";

type Result = { data: unknown; error: { message: string } | null };

const getUser = vi.fn();
let profile: Result;
let me: Result;
let everyone: Result;
let relationships: Result;
const from = vi.fn((table: string) => {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: () => query,
    // A single-row read is the account's own lookup; a list is the whole tree.
    maybeSingle: () => Promise.resolve(table === "profiles" ? profile : me),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(table === "people" ? everyone : relationships).then(resolve),
  };
  return query;
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/people/birth-order", () => ({
  fetchBirthOrders: async () => new Map(),
  withBirthOrder: <T,>(rows: T[]) => rows,
}));
vi.mock("@/lib/storage/photos", () => ({ withSignedPhotos: async <T,>(_: unknown, rows: T[]) => rows }));

import { loadTreeForExport } from "./tree-export";

const treeWasRead = () => from.mock.calls.some(([t]) => t === "relationships");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  profile = { data: { person_id: "p1" }, error: null };
  me = { data: { id: "p1" }, error: null };
  everyone = { data: [{ id: "p1" }], error: null };
  relationships = { data: [{ id: "r1" }], error: null };
});

describe("loadTreeForExport", () => {
  test("no session: nothing, not even a query", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "failed" });
    expect(from).not.toHaveBeenCalled();
  });

  test("an account not linked to the tree gets no family data", async () => {
    profile = { data: { person_id: null }, error: null };
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "not-linked" });
    expect(treeWasRead()).toBe(false);
  });

  test("an account whose person can't be read (unapproved, or removed) gets no family data", async () => {
    me = { data: null, error: null };
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "not-linked" });
    expect(treeWasRead()).toBe(false);
  });

  test("a linked member gets everyone on the tree", async () => {
    expect(await loadTreeForExport()).toEqual({ ok: true, people: [{ id: "p1" }], relationships: [{ id: "r1" }] });
  });

  test("a database hiccup is never reported as not being linked", async () => {
    profile = { data: null, error: { message: "boom" } };
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "failed" });
    profile = { data: { person_id: "p1" }, error: null };
    me = { data: null, error: { message: "boom" } };
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "failed" });
    expect(treeWasRead()).toBe(false);
  });

  test("a failed tree read is reported, never shown as an empty tree", async () => {
    everyone = { data: null, error: { message: "boom" } };
    expect(await loadTreeForExport()).toEqual({ ok: false, reason: "failed" });
  });
});
