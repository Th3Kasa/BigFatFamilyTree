/**
 * A person's close family, grouped and labelled for the profile page
 * (the "family circles" row and the Family tab). Pure, so it is unit tested.
 *
 * Relationship direction (see lib/kinship): for `adopted_by`, `raised_by` and
 * `godparent`, person_a is the child and person_b the parent / guardian / godparent.
 */

import { inferParents } from "@/lib/people/inferParents";

export type FamilyPerson = {
  id: string;
  slug: string | null;
  given_en: string | null;
  given_ar: string | null;
  family_name_en: string | null;
  family_name_ar: string | null;
  father_id: string | null;
  mother_id: string | null;
  gender: "m" | "f" | "unknown" | null;
  is_placeholder: boolean | null;
  photo_url: string | null;
  birth_date?: string | null;
  death_date?: string | null;
};

export type FamilyRelationship = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  type: "spouse" | "adopted_by" | "raised_by" | "godparent" | string;
  status: "current" | "divorced" | "widowed" | string;
  order_index?: number | null;
};

export type Kin =
  | "partner"
  | "ex-partner"
  | "late-partner"
  | "parent"
  | "child"
  | "sibling"
  | "half-sibling"
  | "adoptive-parent"
  | "adopted-child"
  | "guardian"
  | "ward"
  | "godparent"
  | "godchild";

export type FamilyMember = {
  person: FamilyPerson;
  kin: Kin;
  /** Parent shown because they are the recorded parent's only current spouse. */
  inferred?: boolean;
};

export type Family = {
  partners: FamilyMember[];
  parents: FamilyMember[];
  children: FamilyMember[];
  siblings: FamilyMember[];
  /** Adoption, guardianship and godparent links. */
  others: FamilyMember[];
  /** True when one or both parents are not recorded. */
  missingParent: { father: boolean; mother: boolean };
};

function byBirth(a: FamilyMember, b: FamilyMember) {
  const ay = a.person.birth_date ?? "9999";
  const by = b.person.birth_date ?? "9999";
  return ay < by ? -1 : ay > by ? 1 : 0;
}

export function familyOf(
  personId: string,
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
): Family {
  const byId = new Map(people.map((p) => [p.id, p]));
  const self = byId.get(personId);
  const real = (p: FamilyPerson | undefined): p is FamilyPerson => !!p && !p.is_placeholder;

  // Parents (with the read-only inference used elsewhere on the profile)
  const parents: FamilyMember[] = [];
  const missingParent = { father: true, mother: true };
  if (self) {
    const { father, mother } = inferParents(
      { id: self.id, father_id: self.father_id, mother_id: self.mother_id },
      people,
      relationships,
    );
    for (const [slot, pd] of [["father", father], ["mother", mother]] as const) {
      if (pd.kind === "not-recorded") continue;
      const p = byId.get(pd.personId);
      if (!real(p)) continue;
      missingParent[slot] = false;
      parents.push({ person: p, kin: "parent", inferred: pd.kind === "inferred" });
    }
  }

  // Partners, adoption, guardianship, godparents
  const partners: FamilyMember[] = [];
  const others: FamilyMember[] = [];
  const spouseRels = relationships
    .filter((r) => r.type === "spouse" && (r.person_a_id === personId || r.person_b_id === personId))
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  for (const r of spouseRels) {
    const other = byId.get(r.person_a_id === personId ? r.person_b_id : r.person_a_id);
    if (!real(other)) continue;
    const kin: Kin = r.status === "divorced" ? "ex-partner" : r.status === "widowed" ? "late-partner" : "partner";
    partners.push({ person: other, kin });
  }
  // Current partners first, then widowed, then former.
  const rank: Record<string, number> = { partner: 0, "late-partner": 1, "ex-partner": 2 };
  partners.sort((a, b) => rank[a.kin] - rank[b.kin]);

  for (const r of relationships) {
    if (r.type === "spouse") continue;
    const isChildSide = r.person_a_id === personId;
    const isParentSide = r.person_b_id === personId;
    if (!isChildSide && !isParentSide) continue;
    const other = byId.get(isChildSide ? r.person_b_id : r.person_a_id);
    if (!real(other)) continue;
    const kin: Kin | null =
      r.type === "adopted_by"
        ? isChildSide ? "adoptive-parent" : "adopted-child"
        : r.type === "raised_by"
          ? isChildSide ? "guardian" : "ward"
          : r.type === "godparent"
            ? isChildSide ? "godparent" : "godchild"
            : null;
    if (kin) others.push({ person: other, kin });
  }

  // Children (by recorded parent ids)
  const children = people
    .filter((p) => real(p) && p.id !== personId && (p.father_id === personId || p.mother_id === personId))
    .map<FamilyMember>((p) => ({ person: p, kin: "child" }))
    .sort(byBirth);

  // Siblings: share at least one recorded parent
  const siblings: FamilyMember[] = [];
  if (self && (self.father_id || self.mother_id)) {
    for (const p of people) {
      if (!real(p) || p.id === personId) continue;
      const sameFather = !!self.father_id && p.father_id === self.father_id;
      const sameMother = !!self.mother_id && p.mother_id === self.mother_id;
      if (!sameFather && !sameMother) continue;
      // Full siblings share every parent that is recorded on both sides.
      const full =
        (!self.father_id || !p.father_id || sameFather) && (!self.mother_id || !p.mother_id || sameMother);
      siblings.push({ person: p, kin: full ? "sibling" : "half-sibling" });
    }
    siblings.sort(byBirth);
  }

  return { partners, parents, children, siblings, others, missingParent };
}

type G = FamilyPerson["gender"];

function gendered(g: G, m: string, f: string, n: string) {
  return g === "m" ? m : g === "f" ? f : n;
}

/** "Husband", "Daughter", "Half-brother"… in English or Arabic. */
export function kinLabel(member: FamilyMember, lang: "ar" | "en"): string {
  const g = member.person.gender;
  if (lang === "ar") {
    switch (member.kin) {
      case "partner": return gendered(g, "زوج", "زوجة", "شريك الحياة");
      case "ex-partner": return gendered(g, "الزوج السابق", "الزوجة السابقة", "شريك سابق");
      case "late-partner": return gendered(g, "الزوج الراحل", "الزوجة الراحلة", "شريك راحل");
      case "parent": return gendered(g, "الأب", "الأم", "أحد الوالدين");
      case "child": return gendered(g, "ابن", "ابنة", "طفل");
      case "sibling": return gendered(g, "أخ", "أخت", "شقيق");
      case "half-sibling": return gendered(g, "أخ غير شقيق", "أخت غير شقيقة", "أخ/أخت غير شقيق");
      case "adoptive-parent": return gendered(g, "الأب بالتبني", "الأم بالتبني", "والد بالتبني");
      case "adopted-child": return gendered(g, "ابن بالتبني", "ابنة بالتبني", "طفل بالتبني");
      case "guardian": return gendered(g, "الوصيّ", "الوصيّة", "الوصيّ");
      case "ward": return gendered(g, "ربيب", "ربيبة", "ربيب");
      case "godparent": return gendered(g, "العرّاب", "العرّابة", "العرّاب");
      case "godchild": return gendered(g, "الفليون", "الفليونة", "الفليون");
    }
  }
  switch (member.kin) {
    case "partner": return gendered(g, "Husband", "Wife", "Partner");
    case "ex-partner": return gendered(g, "Ex-husband", "Ex-wife", "Ex-partner");
    case "late-partner": return gendered(g, "Late husband", "Late wife", "Late partner");
    case "parent": return gendered(g, "Father", "Mother", "Parent");
    case "child": return gendered(g, "Son", "Daughter", "Child");
    case "sibling": return gendered(g, "Brother", "Sister", "Sibling");
    case "half-sibling": return gendered(g, "Half-brother", "Half-sister", "Half-sibling");
    case "adoptive-parent": return gendered(g, "Adoptive father", "Adoptive mother", "Adoptive parent");
    case "adopted-child": return gendered(g, "Adopted son", "Adopted daughter", "Adopted child");
    case "guardian": return "Guardian";
    case "ward": return gendered(g, "Foster son", "Foster daughter", "Foster child");
    case "godparent": return gendered(g, "Godfather", "Godmother", "Godparent");
    case "godchild": return gendered(g, "Godson", "Goddaughter", "Godchild");
  }
}
