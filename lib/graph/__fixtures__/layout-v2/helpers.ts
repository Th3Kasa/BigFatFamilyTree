import type { PersonInput, RelationshipInput } from "../../transform";

export function person(
  id: string,
  opts: Partial<PersonInput> = {},
): PersonInput {
  return {
    id,
    slug: id,
    given_en: id,
    given_ar: null,
    family_name_en: null,
    family_name_ar: null,
    father_id: null,
    mother_id: null,
    gender: "unknown",
    is_placeholder: false,
    photo_url: null,
    pos_x: null,
    pos_y: null,
    ...opts,
  };
}

export function spouse(
  id: string,
  a: string,
  b: string,
  status: "current" | "divorced" | "widowed" = "current",
  order_index = 0,
): RelationshipInput {
  return {
    id,
    person_a_id: a,
    person_b_id: b,
    type: "spouse",
    status,
    order_index,
  };
}

export function adopted(
  id: string,
  child: string,
  parent: string,
): RelationshipInput {
  return {
    id,
    person_a_id: child,
    person_b_id: parent,
    type: "adopted_by",
    status: "current",
    order_index: 0,
  };
}

export type FixtureExpected = {
  /** Map person id → expected generational rank (0 = top). */
  ranks: Record<string, number>;
  /** Optional ids that should be x-near each other (couples). */
  couples?: Array<[string, string]>;
  /** Optional ids that should be centered under midpoint of two parents. */
  midpointChildren?: Array<{ child: string; parents: [string, string] }>;
};
