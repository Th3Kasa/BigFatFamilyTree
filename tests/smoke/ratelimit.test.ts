import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: () => ({
    UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "fake",
  }),
}));

describe("ratelimit module", () => {
  beforeEach(() => vi.resetModules());

  it("exposes named limiters", async () => {
    const mod = await import("@/lib/ratelimit");
    expect(mod.limiters.auth).toBeDefined();
    expect(mod.limiters.extraction).toBeDefined();
    expect(mod.limiters.upload).toBeDefined();
    expect(mod.limiters.generic).toBeDefined();
  });

  it("fails open when Upstash is unreachable", async () => {
    vi.doMock("@upstash/ratelimit", () => {
      class Ratelimit {
        static slidingWindow = () => ({});
        limit = () => Promise.reject(new TypeError("fetch failed"));
      }
      return { Ratelimit };
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkLimit } = await import("@/lib/ratelimit");

    await expect(checkLimit("auth", "1.2.3.4")).resolves.toMatchObject({ success: true });
    expect(errSpy).toHaveBeenCalledOnce();

    errSpy.mockRestore();
    vi.doUnmock("@upstash/ratelimit");
  });
});
