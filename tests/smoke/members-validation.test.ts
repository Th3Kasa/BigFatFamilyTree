import { describe, expect, it } from "vitest";
import {
  addFamilyMemberSchema,
  dobSchema,
  fullNameSchema,
  isRealIsoDate,
  memberRoleSchema,
  signUpProfileSchema,
  submitLinkRequestSchema,
  todayIso,
} from "@/lib/validation/members";

const UUID = "3f8f3c1e-8d3a-4a58-9d57-1d6c2f6f8a10";

describe("sign-up profile validation", () => {
  it("accepts a normal name and a past date of birth", () => {
    expect(signUpProfileSchema.safeParse({ fullName: "  Omar Haddad ", dateOfBirth: "1998-04-12" }).success).toBe(true);
    expect(fullNameSchema.parse("  Omar Haddad ")).toBe("Omar Haddad");
  });

  it("accepts an Arabic name", () => {
    expect(fullNameSchema.safeParse("عمر حداد").success).toBe(true);
  });

  it("rejects empty or symbol-only names", () => {
    expect(fullNameSchema.safeParse("").success).toBe(false);
    expect(fullNameSchema.safeParse("   ").success).toBe(false);
    expect(fullNameSchema.safeParse("1234").success).toBe(false);
  });

  it("rejects future, impossible and ancient dates of birth", () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(dobSchema.safeParse(tomorrow).success).toBe(false);
    expect(dobSchema.safeParse("1998-02-31").success).toBe(false);
    expect(dobSchema.safeParse("1850-01-01").success).toBe(false);
    expect(dobSchema.safeParse("12/04/1998").success).toBe(false);
    expect(dobSchema.safeParse(todayIso()).success).toBe(true);
  });

  it("isRealIsoDate catches calendar overflow", () => {
    expect(isRealIsoDate("2024-02-29")).toBe(true);
    expect(isRealIsoDate("2023-02-29")).toBe(false);
  });
});

describe("link request input", () => {
  it("allows a claim on a person, with the parents note dropped", () => {
    const r = submitLinkRequestSchema.parse({ personId: UUID });
    expect(r).toEqual({ personId: UUID, parentsNote: null, fatherName: null, motherName: null, invitedBy: null });
  });

  it("allows 'not in the tree' with an optional, trimmed note", () => {
    expect(submitLinkRequestSchema.parse({ personId: null, parentsNote: "  Samir and Dina " })).toEqual({
      personId: null,
      parentsNote: "Samir and Dina",
      fatherName: null,
      motherName: null,
      invitedBy: null,
    });
    expect(submitLinkRequestSchema.parse({ personId: null, parentsNote: "   " }).parentsNote).toBeNull();
  });

  it("keeps the optional father, mother and invited-by details, trimmed", () => {
    const r = submitLinkRequestSchema.parse({ personId: null, fatherName: " Samir ", motherName: "", invitedBy: "Aunt Dina" });
    expect(r).toMatchObject({ fatherName: "Samir", motherName: null, invitedBy: "Aunt Dina" });
    expect(submitLinkRequestSchema.safeParse({ personId: null, fatherName: "x".repeat(121) }).success).toBe(false);
  });

  it("rejects a non-uuid person and an over-long note", () => {
    expect(submitLinkRequestSchema.safeParse({ personId: "abc" }).success).toBe(false);
    expect(submitLinkRequestSchema.safeParse({ personId: null, parentsNote: "x".repeat(501) }).success).toBe(false);
  });
});

describe("role change input", () => {
  it("only accepts the three real roles", () => {
    expect(memberRoleSchema.safeParse({ profileId: UUID, role: "admin" }).success).toBe(true);
    expect(memberRoleSchema.safeParse({ profileId: UUID, role: "owner" }).success).toBe(false);
  });
});

describe("add family member input", () => {
  const base = { gender: "unknown", given_en: "Layla" };

  it("needs a first name in English or Arabic", () => {
    expect(addFamilyMemberSchema.safeParse({ gender: "f" }).success).toBe(false);
    expect(addFamilyMemberSchema.safeParse({ gender: "f", given_ar: "ليلى" }).success).toBe(true);
    expect(addFamilyMemberSchema.safeParse(base).success).toBe(true);
  });

  it("treats blank optional fields as null", () => {
    const r = addFamilyMemberSchema.parse({ ...base, birth_date: "", father_id: "", mother_id: "" });
    expect(r.birth_date).toBeNull();
    expect(r.father_id).toBeNull();
    expect(r.mother_id).toBeNull();
  });

  it("rejects a future birth date and a malformed parent id", () => {
    expect(addFamilyMemberSchema.safeParse({ ...base, birth_date: "2999-01-01" }).success).toBe(false);
    expect(addFamilyMemberSchema.safeParse({ ...base, father_id: "nope" }).success).toBe(false);
  });
});
