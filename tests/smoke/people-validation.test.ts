import { describe, it, expect } from "vitest";
import { personSchema, type PersonInput } from "@/lib/validation/people";

describe("personSchema", () => {
  const valid: PersonInput = {
    given_en: "Alice",
    given_ar: null,
    father_name_en: null,
    father_name_ar: null,
    grandfather_name_en: null,
    grandfather_name_ar: null,
    great_grandfather_name_en: null,
    great_grandfather_name_ar: null,
    family_name_en: "Smith",
    family_name_ar: null,
    gender: "f",
    father_id: null,
    mother_id: null,
    is_placeholder: false,
    photo_url: null,
    notes_en: null,
    notes_ar: null,
    birth_date: null,
    death_date: null,
  };

  it("accepts a valid person with only given_en", () => {
    expect(personSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects when both given_en and given_ar are null", () => {
    const result = personSchema.safeParse({ ...valid, given_en: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/name/i);
    }
  });

  it("rejects invalid gender", () => {
    const result = personSchema.safeParse({ ...valid, gender: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects photo_url that is not a URL", () => {
    const result = personSchema.safeParse({ ...valid, photo_url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts null photo_url", () => {
    expect(personSchema.safeParse({ ...valid, photo_url: null }).success).toBe(true);
  });

  it("accepts a valid UUID for father_id", () => {
    const result = personSchema.safeParse({
      ...valid,
      father_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID father_id", () => {
    const result = personSchema.safeParse({ ...valid, father_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
