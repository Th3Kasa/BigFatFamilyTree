// @vitest-environment node
// (Node keeps the Origin header on a constructed Request; happy-dom drops it.)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getAdminContext, getSignedInUserId, listActive, recordHeartbeat, redirect } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  getSignedInUserId: vi.fn(),
  listActive: vi.fn(),
  recordHeartbeat: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

vi.mock("@/lib/members/auth", () => ({ getAdminContext, getSignedInUserId }));
vi.mock("@/lib/presence/store", () => ({ listActive, recordHeartbeat }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/lang/server", () => ({ getLang: async () => "en" }));

import { GET as liveGET } from "@/app/api/admin/live/route";
import { POST as presencePOST } from "@/app/api/presence/route";
import AdminLivePage from "@/app/admin/live/page";
import { agoLabel, cleanPath, pageLabel } from "@/lib/presence/rules";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

function adminCtx(profiles: { id: string; full_name: string | null; display_name: string | null }[]) {
  const query = { select: vi.fn(), in: vi.fn() };
  query.select.mockReturnValue(query);
  query.in.mockResolvedValue({ data: profiles, error: null });
  return { supabase: { from: vi.fn(() => query) }, userId: ADMIN, isSuperAdmin: false };
}

const heartbeat = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("https://www.bigfatfamilytree.com.au/api/presence", {
    method: "POST",
    headers: { "content-type": "application/json", host: "www.bigfatfamilytree.com.au", origin: "https://www.bigfatfamilytree.com.au", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/live (access check)", () => {
  it("is a 404 for anyone who is not an admin, and never reads presence", async () => {
    getAdminContext.mockResolvedValue(null);
    const res = await liveGET();
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(listActive).not.toHaveBeenCalled();
  });

  it("lists active members with names for an admin, skipping deleted accounts", async () => {
    getAdminContext.mockResolvedValue(
      adminCtx([
        { id: ADMIN, full_name: "Basem Morkos", display_name: null },
        { id: MEMBER, full_name: null, display_name: "Mona" },
      ]),
    );
    listActive.mockResolvedValue([
      { userId: MEMBER, lastSeen: 1_000, path: "/people" },
      { userId: GONE, lastSeen: 900, path: "/" },
      { userId: ADMIN, lastSeen: 800, path: null },
    ]);
    const res = await liveGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toEqual([
      { userId: MEMBER, name: "Mona", lastSeen: 1_000, path: "/people", isYou: false },
      { userId: ADMIN, name: "Basem Morkos", lastSeen: 800, path: null, isYou: true },
    ]);
  });

  it("is a 503 (not a crash) when the presence store is down", async () => {
    getAdminContext.mockResolvedValue(adminCtx([]));
    listActive.mockRejectedValue(new TypeError("fetch failed"));
    const res = await liveGET();
    expect(res.status).toBe(503);
  });
});

describe("/admin/live page (access check)", () => {
  it("sends non-admins home", async () => {
    getAdminContext.mockResolvedValue(null);
    await expect(AdminLivePage()).rejects.toThrow("NEXT_REDIRECT /");
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("renders for an admin", async () => {
    getAdminContext.mockResolvedValue(adminCtx([]));
    await expect(AdminLivePage()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("POST /api/presence", () => {
  it("refuses signed-out callers", async () => {
    getSignedInUserId.mockResolvedValue(null);
    const res = await presencePOST(heartbeat({ path: "/" }));
    expect(res.status).toBe(401);
    expect(recordHeartbeat).not.toHaveBeenCalled();
  });

  it("refuses other sites and non-JSON posts", async () => {
    getSignedInUserId.mockResolvedValue({ userId: MEMBER });
    expect((await presencePOST(heartbeat({ path: "/" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await presencePOST(heartbeat({ path: "/" }, { "content-type": "text/plain" }))).status).toBe(415);
    expect(recordHeartbeat).not.toHaveBeenCalled();
  });

  it("records the caller's own id and a bare pathname", async () => {
    getSignedInUserId.mockResolvedValue({ userId: MEMBER });
    const res = await presencePOST(heartbeat({ path: "/people?q=secret#x", userId: ADMIN }));
    expect(res.status).toBe(204);
    expect(recordHeartbeat).toHaveBeenCalledWith(MEMBER, "/people");
  });

  it("answers 503 when the store is down", async () => {
    getSignedInUserId.mockResolvedValue({ userId: MEMBER });
    recordHeartbeat.mockRejectedValue(new TypeError("fetch failed"));
    expect((await presencePOST(heartbeat({ path: "/" }))).status).toBe(503);
  });
});

describe("presence rules", () => {
  const t = (en: string) => en;

  it("keeps only plain pathnames", () => {
    expect(cleanPath("/person/abc-123")).toBe("/person/abc-123");
    expect(cleanPath("/people?q=mona")).toBe("/people");
    expect(cleanPath("//evil.example")).toBeNull();
    expect(cleanPath("https://evil.example")).toBeNull();
    expect(cleanPath("/<script>")).toBeNull();
    expect(cleanPath("/" + "a".repeat(300))).toBeNull();
    expect(cleanPath(42)).toBeNull();
  });

  it("names pages and times", () => {
    expect(pageLabel("/", t)).toBe("Family tree");
    expect(pageLabel("/person/abc/edit", t)).toBe("Editing a profile");
    expect(pageLabel("/person/abc", t)).toBe("Viewing a profile");
    expect(pageLabel(null, t)).toBe("Unknown page");
    expect(agoLabel(100_000, 110_000, t)).toBe("just now");
    expect(agoLabel(0, 130_000, t)).toBe("2 min ago");
  });
});
