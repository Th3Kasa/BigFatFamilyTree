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
});
