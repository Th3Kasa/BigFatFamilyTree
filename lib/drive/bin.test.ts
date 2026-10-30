// Mocks the service client, so (like the code it tests) it is marked server-only.
import "server-only";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; drive_original_id: string; drive_display_id: string };
const state = { rows: [] as Row[], count: 0, selectError: null as null | { message: string }, updated: [] as string[] };

// A tiny stand-in for the Supabase query builder: select … returns the rows,
// update … records which post_media rows were stamped as binned.
function query() {
  const q = {
    _update: false,
    _id: "",
    select: () => q,
    not: () => q,
    is: () => q,
    limit: () => Promise.resolve({ data: state.rows, error: state.selectError, count: state.count }),
    update: () => {
      q._update = true;
      return q;
    },
    eq: (_c: string, id: string) => {
      state.updated.push(id);
      return Promise.resolve({ error: null });
    },
  };
  return q;
}
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: () => query() }) }));

const trashFile = vi.fn(async (id: string) => !id.startsWith("offline"));
vi.mock("./client", () => ({ trashFile: (id: string) => trashFile(id) }));

const { binDeletedPostPhotos, countDeletedPostPhotos } = await import("./bin");

beforeEach(() => {
  state.rows = [];
  state.count = 0;
  state.selectError = null;
  state.updated = [];
  trashFile.mockClear();
});

describe("binning photos of deleted posts", () => {
  it("bins the original and the timeline copy, then records it", async () => {
    state.rows = [{ id: "m1", drive_original_id: "orig-aaaaaaaaaa", drive_display_id: "disp-aaaaaaaaaa" }];
    state.count = 1;
    expect(await binDeletedPostPhotos()).toEqual({ binned: 1, remaining: 0, available: true });
    expect(trashFile.mock.calls.map((c) => c[0]).sort()).toEqual(["disp-aaaaaaaaaa", "orig-aaaaaaaaaa"]);
    expect(state.updated).toEqual(["m1"]);
  });

  it("leaves a photo for next time when Drive couldn't take one of its files", async () => {
    state.rows = [
      { id: "ok", drive_original_id: "orig-bbbbbbbbbb", drive_display_id: "disp-bbbbbbbbbb" },
      { id: "retry", drive_original_id: "offline-cccccccc", drive_display_id: "disp-cccccccccc" },
    ];
    state.count = 2;
    expect(await binDeletedPostPhotos()).toEqual({ binned: 1, remaining: 1, available: true });
    expect(state.updated).toEqual(["ok"]);
  });

  it("does nothing, and says so, before the database change is applied", async () => {
    state.selectError = { message: "column post_media.drive_trashed_at does not exist" };
    expect(await binDeletedPostPhotos()).toEqual({ binned: 0, remaining: 0, available: false });
    expect(await countDeletedPostPhotos()).toBeNull();
    expect(trashFile).not.toHaveBeenCalled();
  });

  it("counts what's still waiting", async () => {
    state.count = 7;
    expect(await countDeletedPostPhotos()).toBe(7);
  });
});
