import { describe, expect, test } from "vitest";
import { composePartialDate, formatPartialDate, isPartialDate, parsePartialDate } from "./partial-date";

describe("partial dates", () => {
  test("parse what is stored, ignore anything else", () => {
    expect(parsePartialDate("1917")).toEqual({ year: "1917", month: "", day: "" });
    expect(parsePartialDate("1917-05")).toEqual({ year: "1917", month: "5", day: "" });
    expect(parsePartialDate("1917-05-09")).toEqual({ year: "1917", month: "5", day: "9" });
    expect(parsePartialDate("about 1917")).toEqual({ year: "", month: "", day: "" });
    expect(parsePartialDate(null).year).toBe("");
  });

  test("compose only what is known", () => {
    expect(composePartialDate({ year: "191", month: "5", day: "9" })).toBe("");
    expect(composePartialDate({ year: "1917", month: "", day: "" })).toBe("1917");
    expect(composePartialDate({ year: "1917", month: "", day: "9" })).toBe("1917");
    expect(composePartialDate({ year: "1917", month: "5", day: "" })).toBe("1917-05");
    expect(composePartialDate({ year: "1917", month: "5", day: "9" })).toBe("1917-05-09");
    expect(composePartialDate({ year: "1917", month: "2", day: "29" })).toBe("1917-02");
    expect(composePartialDate({ year: "1916", month: "2", day: "29" })).toBe("1916-02-29");
  });

  test("validate", () => {
    for (const ok of ["", "1917", "1917-05", "1916-02-29"]) expect(isPartialDate(ok)).toBe(true);
    for (const bad of ["17", "1917-13", "1917-02-29", "1917-5", "12/05/1917"]) expect(isPartialDate(bad)).toBe(false);
  });

  test("format for reading", () => {
    expect(formatPartialDate("1917")).toBe("1917");
    expect(formatPartialDate("1917-05")).toBe("May 1917");
    expect(formatPartialDate("1917-05-09", "ar")).toBe("9 مايو 1917");
    expect(formatPartialDate("")).toBeNull();
  });
});
