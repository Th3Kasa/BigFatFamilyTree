import { describe, expect, it } from "vitest";
import {
  dobMatchLevel,
  dobToBirthDateText,
  formatParentage,
  nameScore,
  normalizeName,
  parseBirthDate,
  rankCandidates,
  splitFullName,
} from "./match";

describe("parseBirthDate", () => {
  it("reads ISO, partial ISO, year-only and day-first dates", () => {
    expect(parseBirthDate("1998-04-12")).toEqual({ year: 1998, month: 4, day: 12 });
    expect(parseBirthDate("1998-04")).toEqual({ year: 1998, month: 4 });
    expect(parseBirthDate("1998")).toEqual({ year: 1998 });
    expect(parseBirthDate("12/04/1998")).toEqual({ year: 1998, month: 4, day: 12 });
    expect(parseBirthDate("c. 1950")).toEqual({ year: 1950 });
  });

  it("reads Arabic-Indic digits", () => {
    expect(parseBirthDate("١٩٩٨-٠٤-١٢")).toEqual({ year: 1998, month: 4, day: 12 });
  });

  it("returns null for junk and empty input", () => {
    expect(parseBirthDate("")).toBeNull();
    expect(parseBirthDate(null)).toBeNull();
    expect(parseBirthDate("unknown")).toBeNull();
  });

  it("keeps the year when month/day are impossible", () => {
    expect(parseBirthDate("1998-13-40")).toEqual({ year: 1998 });
  });
});

describe("dobMatchLevel", () => {
  it("exact when year, month and day agree", () => {
    expect(dobMatchLevel("1998-04-12", "1998-04-12")).toBe("exact");
    expect(dobMatchLevel("12/04/1998", "1998-04-12")).toBe("exact");
  });

  it("year when only the birth year agrees (including year-only tree data)", () => {
    expect(dobMatchLevel("1998-09-01", "1998-04-12")).toBe("year");
    expect(dobMatchLevel("1998", "1998-04-12")).toBe("year");
  });

  it("none when years differ or either side is missing", () => {
    expect(dobMatchLevel("1971-04-12", "1998-04-12")).toBe("none");
    expect(dobMatchLevel(null, "1998-04-12")).toBe("none");
    expect(dobMatchLevel("1998", null)).toBe("none");
  });
});

describe("normalizeName / nameScore", () => {
  it("ignores case, diacritics and Arabic letter variants", () => {
    expect(normalizeName("  José  ")).toBe("jose");
    expect(normalizeName("أحمد")).toBe(normalizeName("احمد"));
    expect(normalizeName("فاطمة")).toBe(normalizeName("فاطمه"));
  });

  it("scores exact given+family above a lone prefix", () => {
    const omar = { given_en: "Omar", family_name_en: "Haddad" };
    expect(nameScore("Omar Haddad", omar)).toBeGreaterThan(nameScore("Om", omar));
    expect(nameScore("Omar Haddad", omar)).toBeGreaterThan(nameScore("Omar", omar));
  });

  it("is 0 when nothing overlaps", () => {
    expect(nameScore("Sara", { given_en: "Omar", family_name_en: "Haddad" })).toBe(0);
  });

  it("matches across the name chain and the other language", () => {
    expect(nameScore("Elias", { given_en: "Omar", father_name_en: "Elias" })).toBeGreaterThan(0);
    expect(nameScore("عمر", { given_ar: "عمر" })).toBeGreaterThan(0);
  });
});

describe("rankCandidates (DOB ranking)", () => {
  const people = [
    { id: "saleh", given_en: "Omar", family_name_en: "Saleh", birth_date: "1971-02-02" },
    { id: "year", given_en: "Omar", family_name_en: "Haddad", birth_date: "1998-09-30" },
    { id: "exact", given_en: "Omar", family_name_en: "Hadad", birth_date: "1998-04-12" },
    { id: "nodate", given_en: "Omar", family_name_en: "Haddad" },
  ];

  it("puts the exact birth date first, then same birth year, then the rest", () => {
    const ranked = rankCandidates(people, { query: "Omar Haddad", dob: "1998-04-12" });
    expect(ranked.map((p) => p.id)).toEqual(["exact", "year", "nodate", "saleh"]);
    expect(ranked.map((p) => p.dobMatch)).toEqual(["exact", "year", "none", "none"]);
  });

  it("breaks ties inside a DOB class by name match", () => {
    const ranked = rankCandidates(
      [
        { id: "weak", given_en: "Omar", family_name_en: "Saleh", birth_date: "1998-01-01" },
        { id: "strong", given_en: "Omar", family_name_en: "Haddad", birth_date: "1998-02-02" },
      ],
      { query: "Omar Haddad", dob: "1998-04-12" },
    );
    expect(ranked.map((p) => p.id)).toEqual(["strong", "weak"]);
  });

  it("keeps an exact-DOB person even if the name was spelled differently", () => {
    const ranked = rankCandidates(
      [{ id: "mohammed", given_en: "Mohammed", birth_date: "2000-05-05" }],
      { query: "Muhammad", dob: "2000-05-05" },
    );
    expect(ranked.map((p) => p.id)).toEqual(["mohammed"]);
  });

  it("drops same-year people whose name does not overlap at all", () => {
    const ranked = rankCandidates(
      [{ id: "stranger", given_en: "Layla", family_name_en: "Khoury", birth_date: "1998-09-30" }],
      { query: "Omar Haddad", dob: "1998-04-12" },
    );
    expect(ranked).toEqual([]);
  });

  it("falls back to name order when no DOB was given", () => {
    const ranked = rankCandidates(people, { query: "Omar Haddad" });
    expect(ranked[0].dobMatch).toBe("none");
    expect(ranked.slice(0, 2).map((p) => p.family_name_en)).toEqual(
      expect.arrayContaining(["Haddad"]),
    );
  });
});

describe("formatParentage", () => {
  const parents = {
    fatherName: { en: "Elias", ar: "إلياس" },
    motherName: { en: "Rania", ar: "رانيا" },
  };
  it("builds son/daughter/child of X & Y in English", () => {
    expect(formatParentage({ gender: "m", ...parents }, "en")).toBe("son of Elias & Rania");
    expect(formatParentage({ gender: "f", ...parents }, "en")).toBe("daughter of Elias & Rania");
    expect(formatParentage({ gender: "unknown", ...parents }, "en")).toBe("child of Elias & Rania");
  });
  it("uses Arabic names and wording in Arabic", () => {
    expect(formatParentage({ gender: "f", ...parents }, "ar")).toBe("ابنة إلياس و رانيا");
  });
  it("handles one or no known parent", () => {
    expect(formatParentage({ gender: "m", fatherName: parents.fatherName, motherName: null }, "en")).toBe(
      "son of Elias",
    );
    expect(formatParentage({ gender: "m", fatherName: null, motherName: null }, "en")).toBeNull();
  });
});

describe("splitFullName / dobToBirthDateText", () => {
  it("splits first and last word", () => {
    expect(splitFullName("Omar Elias Haddad")).toEqual({ given: "Omar", family: "Haddad" });
    expect(splitFullName("Omar")).toEqual({ given: "Omar", family: null });
    expect(splitFullName("  ")).toEqual({ given: "", family: null });
  });
  it("normalises a typed DOB for people.birth_date", () => {
    expect(dobToBirthDateText("1998-4-2")).toBe("1998-04-02");
    expect(dobToBirthDateText("1998")).toBeNull(); // a year alone is not a full birth date
    expect(dobToBirthDateText("1998-04-02")).toBe("1998-04-02");
    expect(dobToBirthDateText(null)).toBeNull();
  });
});
