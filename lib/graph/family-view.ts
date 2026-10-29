/**
 * One person's immediate family, organised by family units: their parents
 * (with each parent's other marriages), each of their own marriages with that
 * marriage's children, and their siblings split into full siblings and
 * half-siblings by shared parent and marriage. Feeds the Family view and the
 * family panel. Pure: unit tested in family-view.test.ts.
 */

import type { PersonInput, RelationshipInput } from "./transform";
import { buildUnions, compareByBirth, marriageOrdinal, type Union, type UnionStatus } from "./units";

export type FamilyUnitView = {
  unionId: string;
  partner: PersonInput | null;
  /** Latest spouse row for this couple (null when the couple was never recorded as married). */
  relationshipId: string | null;
  status: UnionStatus;
  /** 1st, 2nd … marriage of the person this view is about (null when unrecorded). */
  ordinal: number | null;
  implicit: boolean;
  children: PersonInput[];
};

export type ParentView = {
  person: PersonInput;
  slot: "father" | "mother";
  /** This parent's other unions (with children or a partner), in marriage order. */
  otherUnions: FamilyUnitView[];
};

export type SiblingGroup = {
  kind: "full" | "half";
  /** For half-siblings: which parent they share, and that parent's marriage number. */
  via?: "father" | "mother";
  ordinal?: number | null;
  otherParent?: PersonInput | null;
  members: PersonInput[];
};

export type FamilyView = {
  person: PersonInput;
  father: ParentView | null;
  mother: ParentView | null;
  /** The person's own marriages / partnerships in order, each with its children. */
  unions: FamilyUnitView[];
  /** Children with no other recorded parent. */
  soloChildren: PersonInput[];
  siblingGroups: SiblingGroup[];
  hasCurrentPartner: boolean;
};

export function familyView(personId: string, people: PersonInput[], relationships: RelationshipInput[]): FamilyView | null {
  const byId = new Map(people.map((p) => [p.id, p]));
  const person = byId.get(personId);
  if (!person) return null;
  const model = buildUnions(people, relationships);
  const kids = (u: Union | undefined) => (u ? u.childIds.map((id) => byId.get(id)!).filter(Boolean) : []);

  const unitView = (u: Union, of: string): FamilyUnitView => ({
    unionId: u.id,
    partner: u.b ? byId.get(u.a === of ? u.b : u.a) ?? null : null,
    relationshipId: u.relationshipIds[u.relationshipIds.length - 1] ?? null,
    status: u.status,
    ordinal: u.b ? marriageOrdinal(model, of, u.id) : null,
    implicit: u.implicit,
    children: kids(u),
  });

  const birth = model.birthUnionOf.get(personId);
  const parentView = (id: string | null, slot: "father" | "mother"): ParentView | null => {
    const p = id ? byId.get(id) : undefined;
    if (!p) return null;
    const others = (model.unionsOf.get(p.id) ?? []).filter((u) => u.id !== birth).map((u) => unitView(u, p.id));
    const solo = model.soloUnionOf.get(p.id);
    if (solo && solo.id !== birth) others.push(unitView(solo, p.id));
    return { person: p, slot, otherUnions: others };
  };
  const father = parentView(person.father_id, "father");
  const mother = parentView(person.mother_id, "mother");

  const unions = (model.unionsOf.get(personId) ?? []).map((u) => unitView(u, personId));
  const soloChildren = kids(model.soloUnionOf.get(personId));

  const siblingGroups: SiblingGroup[] = [];
  const full = kids(birth ? model.unions.get(birth) : undefined).filter((p) => p.id !== personId);
  if (full.length > 0) siblingGroups.push({ kind: "full", members: full });
  for (const pv of [father, mother]) {
    if (!pv) continue;
    for (const u of pv.otherUnions) {
      if (u.children.length === 0) continue;
      siblingGroups.push({
        kind: "half",
        via: pv.slot,
        ordinal: u.ordinal,
        otherParent: u.partner,
        members: [...u.children].sort(compareByBirth),
      });
    }
  }

  return {
    person,
    father,
    mother,
    unions,
    soloChildren,
    siblingGroups,
    hasCurrentPartner: unions.some((u) => !u.implicit && u.status === "current"),
  };
}

/**
 * Who the Family view opens on when nobody was asked for: the signed-in
 * member if they are on the tree, otherwise the eldest ancestor with the most
 * descendants (the top of the main family).
 */
export function defaultFamilyFocus(people: Pick<PersonInput, "id" | "father_id" | "mother_id" | "is_placeholder" | "birth_date">[], meId: string | null): string | null {
  if (meId && people.some((p) => p.id === meId)) return meId;
  const ids = new Set(people.map((p) => p.id));
  const kids = new Map<string, string[]>();
  for (const p of people) {
    for (const parent of [p.father_id, p.mother_id]) {
      if (parent && ids.has(parent)) kids.set(parent, [...(kids.get(parent) ?? []), p.id]);
    }
  }
  const count = (id: string, seen = new Set<string>()): number => {
    let n = 0;
    for (const c of kids.get(id) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      n += 1 + count(c, seen);
    }
    return n;
  };
  let best: string | null = null;
  let bestN = -1;
  for (const p of people) {
    if (p.is_placeholder || (p.father_id && ids.has(p.father_id)) || (p.mother_id && ids.has(p.mother_id))) continue;
    const n = count(p.id);
    if (n > bestN) {
      best = p.id;
      bestN = n;
    }
  }
  return best ?? people[0]?.id ?? null;
}

const ORDINALS_EN =["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const ORDINALS_AR = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"];

/** "1st marriage", "الزواج الثاني". */
export function marriageName(ordinal: number, lang: "ar" | "en"): string {
  if (lang === "ar") return `الزواج ${ORDINALS_AR[ordinal] ?? ordinal}`;
  return `${ORDINALS_EN[ordinal] ?? `${ordinal}th`} marriage`;
}

/** "Widowed", "مطلّقان" … for a union status (empty for a current marriage). */
export function statusName(status: UnionStatus, lang: "ar" | "en"): string {
  if (status === "divorced") return lang === "ar" ? "طلاق" : "divorced";
  if (status === "widowed") return lang === "ar" ? "ترمّل" : "widowed";
  return "";
}

/** "Half-siblings through your father's 2nd marriage" (or "through Omar's father"). */
export function halfSiblingHeading(via: "father" | "mother", ordinal: number | null, name: string, lang: "ar" | "en", isMe = false): string {
  if (lang === "ar") {
    const parent = isMe ? (via === "father" ? "والدك" : "والدتك") : via === "father" ? `أب ${name}` : `أم ${name}`;
    return ordinal ? `إخوة غير أشقاء من ${marriageName(ordinal, "ar")} لـ${parent}` : `إخوة غير أشقاء عن طريق ${parent}`;
  }
  const parent = isMe ? `your ${via}` : `${name}'s ${via}`;
  return ordinal ? `Half-siblings through ${parent}'s ${marriageName(ordinal, "en")}` : `Half-siblings through ${parent}`;
}

/** The small label under/over a marriage line: "1st marriage · widowed". */
export function marriageLabel(ordinal: number | null | undefined, status: UnionStatus, lang: "ar" | "en"): string {
  const parts: string[] = [];
  if (ordinal) parts.push(marriageName(ordinal, lang));
  const s = statusName(status, lang);
  if (s) parts.push(s);
  return parts.join(" · ");
}
