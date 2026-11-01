// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getViewer, checkLimitStrict, refundLimit, startUpload, trashFile, afterCallbacks, db } = vi.hoisted(() => ({
  getViewer: vi.fn(),
  checkLimitStrict: vi.fn(),
  refundLimit: vi.fn(),
  startUpload: vi.fn(),
  trashFile: vi.fn(),
  afterCallbacks: [] as (() => unknown)[],
  db: { from: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db }));
vi.mock("@/lib/timeline/viewer", () => ({ getViewer }));
vi.mock("@/lib/ratelimit", () => ({ checkLimitStrict, refundLimit, checkLimit: vi.fn(async () => ({ success: true })) }));
vi.mock("@/lib/drive/client", () => ({
  DriveError: class DriveError extends Error {},
  ensureFolder: vi.fn(async () => "folder"),
  safeFileName: (s: string) => s,
  startUpload,
  trashFile,
}));
vi.mock("@/lib/drive/bin", () => ({ binDeletedPostPhotos: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterCallbacks.push(fn) }));

import { createPost, startPhotoUploads } from "@/lib/actions/timeline";
import { GIVE_UP_UPLOAD_MS, POSTABLE_UPLOAD_MS } from "@/lib/media/limits";

const ME = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const UP_O = "33333333-3333-4333-8333-333333333333";
const UP_D = "44444444-4444-4444-8444-444444444444";
const MB = 1024 * 1024;
const photo = { originalBytes: 10 * MB, originalMime: "image/jpeg", displayBytes: MB };
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Call = { method: string; args: unknown[] };

/** A chainable, awaitable query whose result is worked out from the calls made on it. */
function query(table: string, resolve: (table: string, calls: Call[]) => unknown) {
  const calls: Call[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "gte", "lt", "eq", "in", "is", "order", "limit", "delete", "insert", "maybeSingle", "single"]) {
    q[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve(table, calls)).then(ok, bad);
  return { q, calls };
}

const queries: { table: string; calls: Call[] }[] = [];
const has = (calls: Call[], method: string) => calls.some((c) => c.method === method);

function useDb({ stale = [] as { id: string; drive_file_id: string | null; created_at: string }[], uploads = [] as object[] } = {}) {
  db.from.mockImplementation((table: string) => {
    const { q, calls } = query(table, (t, c) => {
      if (t === "people") return { data: { id: PERSON, given_en: "Nadia", family_name_en: "Haddad" }, error: null };
      if (t === "posts") return { data: { id: "post-1" }, error: null };
      if (has(c, "insert")) return { data: { id: "upload-id" }, error: null };
      if (has(c, "lt")) return { data: stale, error: null };
      if (has(c, "delete")) return { data: null, error: null };
      if (t === "media_uploads") return { data: uploads, error: null };
      return { data: null, error: null };
    });
    queries.push({ table, calls });
    return q;
  });
}

const ok = { success: true, unavailable: false, remaining: 10, reset: 0 };
const refused = { success: false, unavailable: false, remaining: 0, reset: 0 };
const down = { success: false, unavailable: true, remaining: 0, reset: 0 };
/** Set what each limiter answers. */
function limits(answers: Partial<Record<"upload" | "uploadBudget" | "uploadBudgetFamily", object>>) {
  checkLimitStrict.mockImplementation(async (key: string) => answers[key as keyof typeof answers] ?? ok);
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  queries.length = 0;
  getViewer.mockResolvedValue({ approved: true, userId: ME, name: "Nadia" });
  limits({});
  startUpload.mockResolvedValue("https://www.googleapis.com/upload/drive/v3/files?upload_id=x");
  trashFile.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("startPhotoUploads: protecting the owner's Drive", () => {
  it("refuses (fails closed) when the rate limiter can't be reached", async () => {
    useDb();
    limits({ upload: down });
    expect(await startPhotoUploads(PERSON, [photo])).toMatchObject({ success: false });
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("takes the photos' size, in whole megabytes, from the member's and the family's daily budgets", async () => {
    useDb();
    expect(await startPhotoUploads(PERSON, [photo, photo])).toMatchObject({ success: true });
    expect(checkLimitStrict).toHaveBeenCalledWith("uploadBudget", ME, 22);
    expect(checkLimitStrict).toHaveBeenCalledWith("uploadBudgetFamily", "family", 22);
    expect(startUpload).toHaveBeenCalledTimes(4);
    expect(refundLimit).not.toHaveBeenCalled();
  });

  it("every upload costs at least one unit, however small", async () => {
    useDb();
    await startPhotoUploads(PERSON, [{ originalBytes: 10, originalMime: "image/jpeg", displayBytes: 10 }]);
    expect(checkLimitStrict).toHaveBeenCalledWith("uploadBudget", ME, 1);
  });

  it("refuses once the member's day is used up", async () => {
    useDb();
    limits({ uploadBudget: refused });
    expect(await startPhotoUploads(PERSON, [photo])).toMatchObject({ success: false, error: expect.stringContaining("today") });
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("refuses once the family's day is used up, and gives the member's share back", async () => {
    useDb();
    limits({ uploadBudgetFamily: refused });
    expect(await startPhotoUploads(PERSON, [photo])).toMatchObject({ success: false, error: expect.stringContaining("family") });
    expect(refundLimit).toHaveBeenCalledWith("uploadBudget", ME, 11);
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("refuses when the budgets can't be read", async () => {
    useDb();
    limits({ uploadBudget: down });
    expect(await startPhotoUploads(PERSON, [photo])).toMatchObject({ success: false, error: expect.stringContaining("paused") });
  });

  it("gives both budgets back if Drive couldn't start the uploads", async () => {
    useDb();
    startUpload.mockRejectedValue(new Error("Drive is down"));
    expect(await startPhotoUploads(PERSON, [photo])).toMatchObject({ success: false });
    expect(refundLimit).toHaveBeenCalledWith("uploadBudget", ME, 11);
    expect(refundLimit).toHaveBeenCalledWith("uploadBudgetFamily", "family", 11);
  });
});

describe("abandoned uploads", () => {
  it("are binned oldest first in the background and forgotten", async () => {
    useDb({
      stale: [
        { id: "a", drive_file_id: "driveFileAAAAAA", created_at: ago(30 * 60 * 60 * 1000) },
        { id: "b", drive_file_id: null, created_at: ago(30 * 60 * 60 * 1000) },
      ],
    });
    await startPhotoUploads(PERSON, [photo]);
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(trashFile).toHaveBeenCalledWith("driveFileAAAAAA");
    const sweep = queries.find((q) => q.table === "media_uploads" && has(q.calls, "lt"));
    expect(sweep?.calls.find((c) => c.method === "order")?.args).toEqual(["created_at"]);
    const del = queries.find((q) => q.table === "media_uploads" && has(q.calls, "delete"));
    expect(del?.calls.find((c) => c.method === "in")?.args).toEqual(["id", ["a", "b"]]);
  });

  it("are kept for another try if Drive won't bin them, and given up on after a week", async () => {
    useDb({
      stale: [
        { id: "recent", drive_file_id: "driveFileAAAAAA", created_at: ago(30 * 60 * 60 * 1000) },
        { id: "ancient", drive_file_id: "driveFileBBBBBB", created_at: ago(GIVE_UP_UPLOAD_MS + 1000) },
      ],
    });
    trashFile.mockResolvedValue(false);
    await startPhotoUploads(PERSON, [photo]);
    await afterCallbacks[0]();
    const del = queries.find((q) => q.table === "media_uploads" && has(q.calls, "delete"));
    expect(del?.calls.find((c) => c.method === "in")?.args).toEqual(["id", ["ancient"]]);
  });

  it("can't be posted once they're close to being binned", async () => {
    const row = (id: string, variant: string) => ({
      id,
      variant,
      mime: "image/jpeg",
      expected_bytes: MB,
      drive_file_id: "driveFile" + id.slice(0, 6),
      created_at: ago(POSTABLE_UPLOAD_MS + 60 * 1000),
    });
    useDb({ uploads: [row(UP_O, "original"), row(UP_D, "display")] });
    const res = await createPost({ personId: PERSON, photos: [{ original: UP_O, display: UP_D, width: 10, height: 10 }] });
    expect(res).toMatchObject({ success: false, error: expect.stringContaining("too long ago") });
  });
});
