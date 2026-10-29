import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next";

const BASE = "https://family.example";

/** What a browser would navigate to for `?next=<encoded>` after the guard. */
function landing(encoded: string): string {
  const raw = new URLSearchParams(`next=${encoded}`).get("next");
  return new URL(safeNextPath(raw), BASE).origin;
}

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/welcome")).toBe("/welcome");
    expect(safeNextPath("/update-password")).toBe("/update-password");
    expect(safeNextPath("/person/abc?tab=1#x")).toBe("/person/abc?tab=1#x");
  });

  it("falls back for missing or non-string input", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(42)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("x".repeat(3000))).toBe("/");
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\t\\evil.com",
    "/\u00a0/evil.com",
    " //evil.com",
  ])("rejects %j", (raw) => {
    expect(safeNextPath(raw)).toBe("/");
  });

  it.each([
    "%2F%2Fevil.com",
    "/%09/evil.com",
    "/%0a/evil.com",
    "/%0d/evil.com",
    "/%09%5cevil.com",
    "/%5c%5cevil.com",
    "%5C%5Cevil.com",
    "javascript%3Aalert(1)",
    "/%2f%2fevil.com",
  ])("never leaves the origin for ?next=%s", (encoded) => {
    expect(landing(encoded)).toBe(BASE);
  });
});
