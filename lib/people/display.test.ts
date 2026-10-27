import { describe, it, expect } from "vitest";
import { AVATAR_TONES, avatarTone, formatEventDate, initialsOf, lifeYears } from "./display";

describe("avatarTone", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarTone("person-1")).toBe(avatarTone("person-1"));
  });

  it("always returns one of the palette tones", () => {
    for (const seed of ["a", "b", "c", "0f3e", "زياد", ""]) {
      expect(AVATAR_TONES).toContain(avatarTone(seed));
    }
  });

  it("spreads different people across more than one colour", () => {
    const tones = new Set(Array.from({ length: 30 }, (_, i) => avatarTone(`id-${i}`).bg));
    expect(tones.size).toBeGreaterThan(1);
  });
});

describe("initialsOf", () => {
  it("uses given and family initials", () => {
    expect(initialsOf({ given_en: "mariam", family_name_en: "haddad" })).toBe("MH");
  });

  it("prefers the active language and falls back to the other", () => {
    expect(initialsOf({ given_en: "Omar", given_ar: "عمر" }, "ar")).toBe("ع");
    expect(initialsOf({ given_ar: "عمر" }, "en")).toBe("ع");
  });

  it("returns ? for a nameless person", () => {
    expect(initialsOf({})).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });
});

describe("lifeYears", () => {
  it("shows a span when both dates are known", () => {
    expect(lifeYears("1938-02-01", "2019-05-04")).toBe("1938 – 2019");
  });

  it("shows birth or death only", () => {
    expect(lifeYears("1942-03-12", null)).toBe("b. 1942");
    expect(lifeYears(null, "2001-01-01")).toBe("d. 2001");
    expect(lifeYears("1942-03-12", null, "ar")).toBe("مواليد 1942");
  });

  it("is empty when nothing is known", () => {
    expect(lifeYears(null, undefined)).toBe("");
  });
});

describe("formatEventDate", () => {
  it("formats exact dates in both languages", () => {
    expect(formatEventDate("1942-03-12", "exact")).toBe("12 March 1942");
    expect(formatEventDate("1942-03-12", "exact", "ar")).toBe("12 مارس 1942");
  });

  it("honours approximate precisions", () => {
    expect(formatEventDate("1942-03-12", "year")).toBe("1942");
    expect(formatEventDate("1947-01-01", "decade")).toBe("1940s");
    expect(formatEventDate("1942-01-01", "before")).toBe("Before 1942");
    expect(formatEventDate("1942-01-01", "around", "ar")).toBe("حوالي 1942");
  });

  it("returns null without a usable date", () => {
    expect(formatEventDate(null, "exact")).toBeNull();
    expect(formatEventDate("not a date", "exact")).toBeNull();
  });
});
