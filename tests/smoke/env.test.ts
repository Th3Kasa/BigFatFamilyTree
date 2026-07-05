import { describe, it, expect } from "vitest";
import { envSchema } from "@/lib/env";

describe("env validation", () => {
  it("rejects when required vars are missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a fully populated env", () => {
    const result = envSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      BOOTSTRAP_ADMIN_CREDENTIALS: "owner@example.com:hunter2",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(result.success).toBe(true);
  });
});
