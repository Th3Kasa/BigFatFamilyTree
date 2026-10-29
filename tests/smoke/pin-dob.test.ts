import { describe, it, expect } from "vitest";
import { checkDobParts, daysInMonth, isLeapYear, MONTH_NAMES, partsFromIso, yearOptions } from "@/lib/validation/dob";
import { pinDobSchema } from "@/lib/auth/pin-validation";

const TODAY = "2026-10-29";
const p = (day: string, month: string, year: string) => ({ day, month, year });

describe("date of birth dropdowns", () => {
  it("knows leap years", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2023)).toBe(false);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2023, 4)).toBe(30);
    expect(daysInMonth(2023, 12)).toBe(31);
  });

  it("accepts real dates, including 29 Feb in a leap year", () => {
    expect(checkDobParts(p("12", "4", "1990"), TODAY)).toEqual({ status: "ok", iso: "1990-04-12" });
    expect(checkDobParts(p("29", "2", "2000"), TODAY)).toEqual({ status: "ok", iso: "2000-02-29" });
    expect(checkDobParts(p("1", "1", "1900"), TODAY)).toEqual({ status: "ok", iso: "1900-01-01" });
    expect(checkDobParts(p("29", "10", "2026"), TODAY)).toEqual({ status: "ok", iso: "2026-10-29" });
  });

  it("rejects impossible dates", () => {
    expect(checkDobParts(p("31", "2", "1990"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
    expect(checkDobParts(p("30", "2", "2000"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
    expect(checkDobParts(p("29", "2", "1900"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" }); // 1900 is not a leap year
    expect(checkDobParts(p("29", "2", "2023"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
    expect(checkDobParts(p("31", "4", "1990"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
    expect(checkDobParts(p("0", "4", "1990"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
    expect(checkDobParts(p("5", "13", "1990"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
    expect(checkDobParts(p("5", "5", "1899"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
    expect(checkDobParts(p("x", "5", "1990"), TODAY)).toEqual({ status: "invalid", code: "dob_invalid" });
  });

  it("rejects the future and reports incomplete choices separately", () => {
    expect(checkDobParts(p("30", "10", "2026"), TODAY)).toEqual({ status: "invalid", code: "dob_future" });
    expect(checkDobParts(p("1", "1", "2027"), TODAY)).toEqual({ status: "invalid", code: "dob_future" });
    expect(checkDobParts(p("", "4", "1990"), TODAY)).toEqual({ status: "incomplete" });
    expect(checkDobParts(p("12", "", ""), TODAY)).toEqual({ status: "incomplete" });
  });

  it("whatever the dropdowns accept, the server schema accepts too (same rule on both sides)", () => {
    for (const [d, m, y] of [["12", "4", "1990"], ["29", "2", "2000"], ["31", "12", "1900"]]) {
      const c = checkDobParts(p(d, m, y), TODAY);
      expect(c.status).toBe("ok");
      if (c.status === "ok") expect(pinDobSchema.safeParse(c.iso).success).toBe(true);
    }
  });

  it("year list runs from the current year down to 1900", () => {
    const ys = yearOptions(2026);
    expect(ys[0]).toBe(2026);
    expect(ys.at(-1)).toBe(1900);
    expect(ys).toHaveLength(127);
  });

  it("has 12 month names in both languages", () => {
    expect(MONTH_NAMES.en).toHaveLength(12);
    expect(MONTH_NAMES.ar).toHaveLength(12);
    expect(new Set(MONTH_NAMES.ar).size).toBe(12);
    expect(MONTH_NAMES.ar[0]).toBe("يناير");
  });

  it("splits a stored birthday back into the three selects", () => {
    expect(partsFromIso("1990-04-02")).toEqual({ day: "2", month: "4", year: "1990" });
    expect(partsFromIso("")).toEqual({ day: "", month: "", year: "" });
    expect(partsFromIso("1990-02-31")).toEqual({ day: "", month: "", year: "" });
  });
});
