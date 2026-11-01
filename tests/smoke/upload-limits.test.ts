// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getViewer, checkLimitStrict, startUpload, trashFile, afterCallbacks, db } = vi.hoisted(() => ({
  getViewer: vi.fn(),
  checkLimitStrict: vi.fn(),
  startUpload: vi.fn(),
  trashFile: vi.fn(),
  afterCallbacks: [] as (() => unknown)[],
  db: { from: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db }));
vi.mock("@/lib/timeline/viewer", () => ({ getViewer }));
vi.mock("@/lib/ratelimit", () => ({ checkLimitStrict, checkLimit: vi.fn(async () => ({ success: true })) }));
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

import { startPhotoUploads } from "@/lib/actions/timeline";
import { MAX_DISPLAY_BYTES, MAX_FAMILY_UPLOAD_BYTES_PER_DAY, MAX_UPLOAD_BYTES_PER_DAY } from "@/lib/media/limits";

const ME = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const MB = 1024 * 1024;
const photo = { originalBytes: 10 * MB, originalMime: "image/jpeg", displayBytes: MB };

type Call = { method: string; args: unknown[] };
type Resolver = (table: string, calls: Call[]) => unknown;

/** A chainable, awaitable query whose result is worked out from the calls made on it. */
function query(table: string, resolve: Resolver) {
  const calls: Call[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "gte", "lt", "eq", "in", "is", "limit", "delete", "insert", "maybeSingle", "single"]) {
    q[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return q;
    };
  }
  q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve(table, calls)).then(ok, bad);
  return { q, calls };
}

const queries: { table: string; calls: Call[] }[] = [];
const filteredBy = (calls: Call[], column: string) => calls.some((c) => c.method === "eq" && c.args[0] === column);

/** Daily totals: `mine` bytes for this member, `others` more for everyone else; `stale` old unposted uploads. */
function useDb({ mine = 0, others = 0, stale = [] as { id: string; drive_file_id: string | null }[] } = {}) {
  db.from.mockImplementation((table: string) => {
    const { q, calls } = query(table, (t, c) => {
      if (t === "people") return { data: { id: PERSON, given_en: "Nadia", family_name_en: "Haddad" }, error: null };
      if (t === "post_media") return { data: [], error: null };
      if (c.some((x) => x.method === "insert")) return { data: { id: "upload-id" }, error: null };
      if (c.some((x) => x.method === "lt")) return { data: stale, error: null };
      if (c.some((x) => x.method === "delete")) return { data: null, error: null };
      const bytes = filteredBy(c, "user_id") ? mine : mine + others;
      return { data: bytes ? [{ expected_bytes: bytes }] : [], error: null };
    });
    queries.push({ table, calls });
    return q;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  queries.length = 0;
  getViewer.mockResolvedValue({ approved: true, userId: ME, name: "Nadia" });
  checkLimitStrict.mockResolvedValue({ success: true, unavailable: false, remaining: 10, reset: 0 });
  startUpload.mockResolvedValue("https://www.googleapis.com/upload/drive/v3/files?upload_id=x");
  trashFile.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("startPhotoUploads: protecting the owner's Drive", () => {
  it("refuses (fails closed) when the rate limiter can't be reached", async () => {
    useDb();
    checkLimitStrict.mockResolvedValue({ success: false, unavailable: true, remaining: 0, reset: 0 });
    const res = await startPhotoUploads(PERSON, [photo]);
    expect(res).toMatchObject({ success: false });
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("refuses once a member has uploaded their daily share", async () => {
    useDb({ mine: MAX_UPLOAD_BYTES_PER_DAY - 5 * MB });
    const res = await startPhotoUploads(PERSON, [photo]);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining("today") });
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("refuses once the whole family has uploaded the daily total", async () => {
    useDb({ others: MAX_FAMILY_UPLOAD_BYTES_PER_DAY - 5 * MB });
    const res = await startPhotoUploads(PERSON, [photo]);
    expect(res).toMatchObject({ success: false, error: expect.stringContaining("family") });
    expect(startUpload).not.toHaveBeenCalled();
  });

  it("starts an original and a timeline copy per photo when under the limits", async () => {
    useDb({ mine: 50 * MB, others: 100 * MB });
    const res = await startPhotoUploads(PERSON, [photo, photo]);
    expect(res).toMatchObject({ success: true });
    expect(startUpload).toHaveBeenCalledTimes(4);
  });

  it("counts posted photos with their timeline copy", async () => {
    useDb();
    const posted = Array.from({ length: 45 }, () => ({ bytes_original: 10 * MB }));
    const base = db.from.getMockImplementation()!;
    db.from.mockImplementation((table: string) =>
      table === "post_media" ? query(table, () => ({ data: posted, error: null })).q : base(table),
    );
    // 45 x (10 MB + the copy), plus this photo, is over one member's day.
    expect(45 * (10 * MB + MAX_DISPLAY_BYTES) + 11 * MB).toBeGreaterThan(MAX_UPLOAD_BYTES_PER_DAY);
    const res = await startPhotoUploads(PERSON, [photo]);
    expect(res).toMatchObject({ success: false });
  });

  it("bins abandoned uploads in the background and forgets them", async () => {
    useDb({ stale: [{ id: "a", drive_file_id: "driveFileAAAAAA" }, { id: "b", drive_file_id: null }] });
    await startPhotoUploads(PERSON, [photo]);
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(trashFile).toHaveBeenCalledWith("driveFileAAAAAA");
    const del = queries.find((q) => q.table === "media_uploads" && q.calls.some((c) => c.method === "delete"));
    expect(del?.calls.find((c) => c.method === "in")?.args).toEqual(["id", ["a", "b"]]);
  });

  it("keeps an abandoned upload's row if Drive wouldn't bin the file, to try again later", async () => {
    useDb({ stale: [{ id: "a", drive_file_id: "driveFileAAAAAA" }] });
    trashFile.mockResolvedValue(false);
    await startPhotoUploads(PERSON, [photo]);
    await afterCallbacks[0]();
    expect(queries.some((q) => q.table === "media_uploads" && q.calls.some((c) => c.method === "delete"))).toBe(false);
  });
});
