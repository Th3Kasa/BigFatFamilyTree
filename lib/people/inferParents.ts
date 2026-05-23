/**
 * Parent inference (read-layer only).
 *
 * When a child has one parent recorded (e.g. `father_id`) but the other
 * parent is missing (`mother_id IS NULL`), we *display* the recorded
 * parent's current spouse as the second parent — but only if that spouse
 * is unambiguous (exactly one current spouse).
 *
 * This NEVER mutates the database. It is purely a presentation helper.
 */

export type PersonRow = {
  id: string;
  given_en: string | null;
  given_ar: string | null;
  family_name_en?: string | null;
  family_name_ar?: string | null;
  father_id?: string | null;
  mother_id?: string | null;
  gender?: "m" | "f" | "unknown" | null;
  is_placeholder?: boolean | null;
};

export type RelationshipRow = {
  person_a_id: string;
  person_b_id: string;
  type: "spouse" | "adopted_by" | "raised_by" | "godparent" | string;
  status: "current" | "divorced" | "widowed" | string;
  order_index?: number | null;
};

export type ChildRow = Pick<PersonRow, "id" | "father_id" | "mother_id">;

export type ParentDisplay =
  | { kind: "recorded"; personId: string; person: PersonRow }
  | {
      kind: "inferred";
      personId: string;
      person: PersonRow;
      sourceSpouseOf: string;
    }
  | { kind: "not-recorded"; expectedGender: "m" | "f" };

export type InferredParents = {
  father: ParentDisplay;
  mother: ParentDisplay;
};

/**
 * Find the unique current spouse of `personId`.
 * Returns the spouse's id, or null if there are 0 or 2+ current spouses.
 */
function findUniqueCurrentSpouseId(
  personId: string,
  relationships: ReadonlyArray<RelationshipRow>,
): string | null {
  const spouseIds = new Set<string>();
  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (r.status !== "current") continue;
    if (r.person_a_id === personId) spouseIds.add(r.person_b_id);
    else if (r.person_b_id === personId) spouseIds.add(r.person_a_id);
  }
  if (spouseIds.size !== 1) return null;
  return [...spouseIds][0]!;
}

export function inferParents(
  child: ChildRow,
  allPeople: ReadonlyArray<PersonRow>,
  allRelationships: ReadonlyArray<RelationshipRow>,
): InferredParents {
  const peopleById = new Map<string, PersonRow>(
    allPeople.map((p) => [p.id, p]),
  );

  const recordedFather = child.father_id
    ? peopleById.get(child.father_id) ?? null
    : null;
  const recordedMother = child.mother_id
    ? peopleById.get(child.mother_id) ?? null
    : null;

  let father: ParentDisplay = recordedFather
    ? { kind: "recorded", personId: recordedFather.id, person: recordedFather }
    : { kind: "not-recorded", expectedGender: "m" };

  let mother: ParentDisplay = recordedMother
    ? { kind: "recorded", personId: recordedMother.id, person: recordedMother }
    : { kind: "not-recorded", expectedGender: "f" };

  // Infer mother from father's unique current spouse
  if (recordedFather && !recordedMother) {
    const spouseId = findUniqueCurrentSpouseId(recordedFather.id, allRelationships);
    if (spouseId) {
      const spouse = peopleById.get(spouseId);
      if (spouse) {
        mother = {
          kind: "inferred",
          personId: spouse.id,
          person: spouse,
          sourceSpouseOf: recordedFather.id,
        };
      }
    }
  }

  // Infer father from mother's unique current spouse
  if (recordedMother && !recordedFather) {
    const spouseId = findUniqueCurrentSpouseId(recordedMother.id, allRelationships);
    if (spouseId) {
      const spouse = peopleById.get(spouseId);
      if (spouse) {
        father = {
          kind: "inferred",
          personId: spouse.id,
          person: spouse,
          sourceSpouseOf: recordedMother.id,
        };
      }
    }
  }

  return { father, mother };
}
