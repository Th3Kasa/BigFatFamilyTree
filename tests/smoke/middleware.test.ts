import { describe, it, expect } from "vitest";
import { isPublicPath } from "@/middleware";

describe("middleware path classification", () => {
  it("classifies /login as public", () => expect(isPublicPath("/login")).toBe(true));
  it("classifies /auth/callback as public", () =>
    expect(isPublicPath("/auth/callback")).toBe(true));
  it("classifies / as public (landing page)", () => expect(isPublicPath("/")).toBe(true));
  it("classifies /transcripts as protected", () =>
    expect(isPublicPath("/transcripts")).toBe(false));
  it("classifies /admin/users as protected", () =>
    expect(isPublicPath("/admin/users")).toBe(false));
  it("classifies static asset paths as public", () =>
    expect(isPublicPath("/_next/static/foo.js")).toBe(true));
});
