import { describe, expect, it } from "vitest";
import {
  CLAIM_QUERY_MAX,
  normalizeClaimQuery,
  toClaimCandidate,
  toPersonSummary,
  type ClaimRow,
} from "@/lib/members/claim-query";
import { buildRequestNote } from "@/lib/members/request-note";

const TODAY = "2026-05-22";

describe("normalizeClaimQuery (input rules for search_people_for_claim)", () => {
  it("rejects queries shorter than 2 characters after trimming", () => {
    for (const q of ["", " ", "a", "  a  ", "\n\t"]) {
      expect(normalizeClaimQuery(q, null, TODAY)).toEqual({ ok: false, reason: "too_short" });
    }
  });
  it("rejects punctuation-only queries (the SQL tokenizer would find nothing)", () => {
    expect(normalizeClaimQuery("!!", null, TODAY).ok).toBe(false);
    expect(normalizeClaimQuery("- -", null, TODAY).ok).toBe(false);
  });
  it("accepts 2+ characters in any script and trims", () => {
    expect(normalizeClaimQuery("  Om ", null, TODAY)).toEqual({ ok: true, input: { q: "Om", dob: null } });
    expect(normalizeClaimQuery("عمر", null, TODAY).ok).toBe(true);
  });
  it("caps the query at 120 characters", () => {
    const res = normalizeClaimQuery("a".repeat(500), null, TODAY);
    expect(res.ok && res.input.q.length).toBe(CLAIM_QUERY_MAX);
  });
  it("treats non-strings as too short", () => {
    expect(normalizeClaimQuery(undefined, null, TODAY).ok).toBe(false);
    expect(normalizeClaimQuery(42, null, TODAY).ok).toBe(false);
  });
  it("keeps a valid date of birth and drops unusable ones", () => {
    const dob = (v: unknown) => {
      const r = normalizeClaimQuery("Omar", v, TODAY);
      return r.ok ? r.input.dob : "BAD";
    };
    expect(dob("1998-04-12")).toBe("1998-04-12");
    expect(dob("1998-13-45")).toBeNull(); // not a real date
    expect(dob("1899-12-31")).toBeNull(); // before the floor
    expect(dob("2027-01-01")).toBeNull(); // in the future
    expect(dob("12/04/1998")).toBeNull();
    expect(dob(null)).toBeNull();
    expect(dob(1998)).toBeNull();
  });
});

describe("RPC rows -> UI types", () => {
  const row: ClaimRow = {
    id: "p1",
    given_en: "Omar",
    given_ar: "عمر",
    family_name_en: "Haddad",
    family_name_ar: null,
    birth_year: 1998,
    father_name_en: "Samir",
    father_name_ar: null,
    mother_name_en: null,
    mother_name_ar: null,
    dob_match: "exact",
  };

  it("exposes only the birth year, never a full date, slug or gender", () => {
    const s = toPersonSummary(row);
    expect(s.birthYear).toBe(1998);
    expect(s.birth_date).toBeNull();
    expect(s.slug).toBeNull();
    expect(s.gender).toBe("unknown");
  });
  it("fills the missing language of a parent name from the other one", () => {
    expect(toPersonSummary(row).fatherName).toEqual({ en: "Samir", ar: "Samir" });
    expect(toPersonSummary(row).motherName).toBeNull();
  });
  it("maps dob_match and the claimed flag; unknown values become 'none'", () => {
    expect(toClaimCandidate(row, new Set(["p1"]))).toMatchObject({ dobMatch: "exact", claimed: true });
    expect(toClaimCandidate({ ...row, dob_match: "weird" }, new Set())).toMatchObject({ dobMatch: "none", claimed: false });
    expect(toClaimCandidate({ ...row, dob_match: undefined }, new Set()).dobMatch).toBe("none");
  });
});

describe("buildRequestNote (the 'not in the tree yet' details)", () => {
  it("is null when nothing was filled in", () => {
    expect(buildRequestNote({})).toBeNull();
    expect(buildRequestNote({ fatherName: "  ", motherName: null, invitedBy: "" })).toBeNull();
  });
  it("lists only what was given, one per line", () => {
    expect(buildRequestNote({ fatherName: "Samir Haddad", invitedBy: "Aunt Dina" })).toBe(
      "Father: Samir Haddad\nInvited by: Aunt Dina",
    );
  });
  it("collapses whitespace and stays within the 500 character column limit", () => {
    expect(buildRequestNote({ motherName: "Dina    Haddad" })).toBe("Mother: Dina Haddad");
    const long = buildRequestNote({ fatherName: "x".repeat(900), motherName: "y".repeat(900), invitedBy: "z".repeat(900) });
    expect(long!.length).toBeLessThanOrEqual(500);
  });
});
