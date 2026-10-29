/**
 * Words for linking relatives in the family panel: "wife", "half-brother",
 * and the confirm button that spells out the result ("Add Maya as Omar's
 * wife"). English and Arabic. Pure: unit tested in relative-copy.test.ts.
 */

export type Lang = "ar" | "en";
export type RelativeSlot = "father" | "mother" | "partner" | "child" | "sibling";
export type Gender = "m" | "f" | "unknown" | null | undefined;
export type PartnerStatus = "current" | "divorced" | "widowed";

type Forms = { en: string; ar: string; arAcc: string };

function forms(slot: RelativeSlot, gender: Gender, status: PartnerStatus): Forms {
  const g = gender === "m" ? "m" : gender === "f" ? "f" : "n";
  switch (slot) {
    case "father":
      return { en: "father", ar: "الأب", arAcc: "أبًا" };
    case "mother":
      return { en: "mother", ar: "الأم", arAcc: "أمًّا" };
    case "child":
      return g === "m"
        ? { en: "son", ar: "الابن", arAcc: "ابنًا" }
        : g === "f"
          ? { en: "daughter", ar: "الابنة", arAcc: "ابنةً" }
          : { en: "child", ar: "الطفل", arAcc: "طفلًا" };
    case "sibling":
      return g === "m"
        ? { en: "brother", ar: "الأخ", arAcc: "أخًا" }
        : g === "f"
          ? { en: "sister", ar: "الأخت", arAcc: "أختًا" }
          : { en: "sibling", ar: "الأخ أو الأخت", arAcc: "أخًا أو أختًا" };
    case "partner": {
      const base =
        g === "m"
          ? { en: "husband", ar: "الزوج", arAcc: "زوجًا" }
          : g === "f"
            ? { en: "wife", ar: "الزوجة", arAcc: "زوجةً" }
            : { en: "partner", ar: "شريك الحياة", arAcc: "شريكًا" };
      if (status === "divorced") {
        return {
          en: `ex-${base.en}`,
          ar: g === "f" ? "الزوجة السابقة" : "الزوج السابق",
          arAcc: g === "f" ? "زوجةً سابقة" : g === "m" ? "زوجًا سابقًا" : "شريكًا سابقًا",
        };
      }
      if (status === "widowed") {
        return {
          en: `late ${base.en}`,
          ar: g === "f" ? "الزوجة الراحلة" : "الزوج الراحل",
          arAcc: g === "f" ? "زوجةً راحلة" : g === "m" ? "زوجًا راحلًا" : "شريكًا راحلًا",
        };
      }
      return base;
    }
  }
}

/** "wife", "الزوجة" — what this relative is to the person. */
export function relativeNoun(slot: RelativeSlot, gender: Gender, lang: Lang, status: PartnerStatus = "current"): string {
  const f = forms(slot, gender, status);
  return lang === "ar" ? f.ar : f.en;
}

/** Title of the add flow: "Add Omar's father" / "إضافة الأب لـعمر". */
export function addTitle(slot: RelativeSlot, subject: string, lang: Lang): string {
  const f = forms(slot, null, "current");
  return lang === "ar" ? `إضافة ${f.ar} لـ${subject}` : `Add ${subject}'s ${f.en}`;
}

/**
 * The confirm button, spelling out the result: "Add Maya as Omar's wife".
 * Without a name yet it falls back to the add-flow title.
 */
export function confirmLabel(
  slot: RelativeSlot,
  subject: string,
  relative: string | null | undefined,
  gender: Gender,
  lang: Lang,
  status: PartnerStatus = "current",
): string {
  const name = relative?.trim();
  if (!name) return addTitle(slot, subject, lang);
  const f = forms(slot, gender, status);
  return lang === "ar" ? `أضف ${name} ${f.arAcc} لـ${subject}` : `Add ${name} as ${subject}'s ${f.en}`;
}

/** Same sentence for "Change": "Make Maya Omar's wife". */
export function changeLabel(slot: RelativeSlot, subject: string, relative: string | null | undefined, gender: Gender, lang: Lang, status: PartnerStatus = "current"): string {
  const name = relative?.trim();
  const f = forms(slot, gender, status);
  if (!name) return lang === "ar" ? `اختر ${f.ar} الصحيح لـ${subject}` : `Pick ${subject}'s ${f.en}`;
  return lang === "ar" ? `اجعل ${name} ${f.arAcc} لـ${subject}` : `Make ${name} ${subject}'s ${f.en}`;
}

/** "Omar's family" / "عائلة عمر". */
export function familyTitle(name: string, lang: Lang): string {
  return lang === "ar" ? `عائلة ${name}` : `${name}'s family`;
}
