// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));

vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = () => ({});
    static fixedWindow = () => ({});
    limit = limit;
  }
  return { Ratelimit };
});
vi.mock("@/lib/env", () => ({ env: () => ({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }) }));

import { checkLimitStrict, refundLimit } from "@/lib/ratelimit";

beforeEach(() => {
  limit.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("checkLimitStrict (fails closed)", () => {
  it("passes the answer through", async () => {
    limit.mockResolvedValue({ success: true, remaining: 3, reset: 9 });
    expect(await checkLimitStrict("pinFail", "id")).toEqual({ success: true, unavailable: false, remaining: 3, reset: 9 });
  });

  it("refuses when Redis timed out, although the library said yes", async () => {
    limit.mockResolvedValue({ success: true, remaining: 0, reset: 0, reason: "timeout" });
    expect(await checkLimitStrict("pinFail", "id")).toMatchObject({ success: false, unavailable: true });
  });

  it("refuses when Redis can't be reached", async () => {
    limit.mockRejectedValue(new Error("network"));
    expect(await checkLimitStrict("uploadBudget", "id", 5)).toMatchObject({ success: false, unavailable: true });
  });

  it("takes several tokens at once, and refunds with a negative rate", async () => {
    limit.mockResolvedValue({ success: true, remaining: 1, reset: 0 });
    await checkLimitStrict("uploadBudget", "me", 12);
    expect(limit).toHaveBeenLastCalledWith("me", { rate: 12 });
    await refundLimit("uploadBudget", "me", 12);
    expect(limit).toHaveBeenLastCalledWith("me", { rate: -12 });
  });
});
