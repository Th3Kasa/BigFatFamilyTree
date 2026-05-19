import { describe, it, expect } from "vitest";
import { roleUpdateSchema } from "@/lib/validation/admin";

describe("roleUpdateSchema", () => {
  it("accepts valid roles", () => {
    expect(roleUpdateSchema.safeParse({ userId: "550e8400-e29b-41d4-a716-446655440001", role: "editor" }).success).toBe(true);
    expect(roleUpdateSchema.safeParse({ userId: "550e8400-e29b-41d4-a716-446655440002", role: "admin" }).success).toBe(true);
    expect(roleUpdateSchema.safeParse({ userId: "550e8400-e29b-41d4-a716-446655440003", role: "viewer" }).success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = roleUpdateSchema.safeParse({ userId: "550e8400-e29b-41d4-a716-446655440001", role: "superuser" });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID userId", () => {
    const result = roleUpdateSchema.safeParse({ userId: "not-a-uuid", role: "editor" });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = roleUpdateSchema.safeParse({ role: "editor" });
    expect(result.success).toBe(false);
  });
});
