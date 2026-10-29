import { describe, expect, test } from "vitest";
import { addTitle, changeLabel, confirmLabel, familyTitle, relativeNoun } from "./relative-copy";

describe("confirmLabel", () => {
  test("spells out the result in English", () => {
    expect(confirmLabel("partner", "Omar", "Maya", "f", "en")).toBe("Add Maya as Omar's wife");
    expect(confirmLabel("partner", "Omar", "Maya", "f", "en", "divorced")).toBe("Add Maya as Omar's ex-wife");
    expect(confirmLabel("father", "Omar", "Elias", "m", "en")).toBe("Add Elias as Omar's father");
    expect(confirmLabel("child", "Omar", "Sara", "f", "en")).toBe("Add Sara as Omar's daughter");
    expect(confirmLabel("sibling", "Omar", "Sam", "unknown", "en")).toBe("Add Sam as Omar's sibling");
  });

  test("and in Arabic", () => {
    expect(confirmLabel("partner", "عمر", "مايا", "f", "ar")).toBe("أضف مايا زوجةً لـعمر");
    expect(confirmLabel("mother", "عمر", "رانيا", "f", "ar")).toBe("أضف رانيا أمًّا لـعمر");
    expect(confirmLabel("partner", "عمر", "مايا", "f", "ar", "widowed")).toBe("أضف مايا زوجةً راحلة لـعمر");
  });

  test("falls back to the title until a name is chosen", () => {
    expect(confirmLabel("father", "Omar", "  ", "m", "en")).toBe("Add Omar's father");
    expect(addTitle("mother", "عمر", "ar")).toBe("إضافة الأم لـعمر");
  });
});

describe("other labels", () => {
  test("nouns, change and titles", () => {
    expect(relativeNoun("sibling", "f", "en")).toBe("sister");
    expect(relativeNoun("partner", "m", "ar", "divorced")).toBe("الزوج السابق");
    expect(changeLabel("partner", "Omar", "Maya", "f", "en")).toBe("Make Maya Omar's wife");
    expect(familyTitle("Omar", "en")).toBe("Omar's family");
    expect(familyTitle("عمر", "ar")).toBe("عائلة عمر");
  });
});
