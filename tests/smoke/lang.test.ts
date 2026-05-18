import { describe, it, expect } from "vitest";

// We test the pure parsing logic extracted from getLang
// getLang itself calls next/headers which is unavailable in vitest.
// So we test a pure helper that getLang delegates to.
import { parseLang } from "@/lib/lang/server";

describe("parseLang", () => {
  it("returns 'en' when cookie is absent", () => {
    expect(parseLang(undefined)).toBe("en");
  });

  it("returns 'ar' when cookie value is 'ar'", () => {
    expect(parseLang("ar")).toBe("ar");
  });

  it("returns 'en' for any other value", () => {
    expect(parseLang("fr")).toBe("en");
    expect(parseLang("")).toBe("en");
  });
});
