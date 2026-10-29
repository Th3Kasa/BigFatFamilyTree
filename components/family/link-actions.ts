/**
 * What each family-panel button does, composed from the existing server
 * actions (lib/actions/people.ts and relationships.ts). Nothing here talks to
 * the database directly; every write still goes through those actions and RLS.
 */

import {
  addSibling,
  createPersonQuick,
  linkChild,
  linkParentChild,
  linkSpouse,
  unlinkParent,
} from "@/lib/actions/people";
import { deleteRelationship, updateRelationshipStatus } from "@/lib/actions/relationships";
import type { PersonInput } from "@/lib/graph/transform";
import type { PartnerStatus, RelativeSlot } from "@/lib/people/relative-copy";

export type LinkResult = { success: boolean; error?: string; personId?: string };

export type NewPersonFields = {
  given_en: string;
  given_ar: string;
  family_name_en: string;
  family_name_ar: string;
  gender: "m" | "f" | "unknown";
  birth_date: string;
};

/** The parent slot a person fills for their children, by gender. */
const parentField = (gender: PersonInput["gender"]) => (gender === "f" ? "mother_id" : "father_id");

/**
 * Which of two parents is the father. Decided by gender when it is clear (one
 * man, one woman); otherwise only by an explicit choice. Returns null rather
 * than guessing, so the form can ask.
 */
export function parentSlots(
  a: Pick<PersonInput, "id" | "gender">,
  b: Pick<PersonInput, "id" | "gender">,
  explicitFatherId?: string | null,
): { fatherId: string; motherId: string } | null {
  if (a.gender === "m" && b.gender === "f") return { fatherId: a.id, motherId: b.id };
  if (a.gender === "f" && b.gender === "m") return { fatherId: b.id, motherId: a.id };
  if (explicitFatherId === a.id) return { fatherId: a.id, motherId: b.id };
  if (explicitFatherId === b.id) return { fatherId: b.id, motherId: a.id };
  return null;
}

export async function addNewRelative(
  subject: PersonInput,
  slot: RelativeSlot,
  fields: NewPersonFields,
  opts: { status?: PartnerStatus; coParent?: PersonInput | null; fatherId?: string | null } = {},
): Promise<LinkResult> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v.trim());
  fd.set("is_placeholder", "false");
  if (slot === "father" || slot === "mother") fd.set("child_id", subject.id);
  if (slot === "partner") fd.set("spouse_id", subject.id);
  if (slot === "child") {
    const co = opts.coParent;
    if (co) {
      // Both parents in the same insert, so the child hangs from the couple's line.
      const pair = parentSlots(subject, co, opts.fatherId);
      if (!pair) return { success: false, error: "Choose which parent is the father." };
      fd.set("father_id", pair.fatherId);
      fd.set("mother_id", pair.motherId);
    } else {
      fd.set(parentField(subject.gender), subject.id);
    }
  }
  if (slot === "sibling") {
    if (subject.father_id) fd.set("father_id", subject.father_id);
    if (subject.mother_id) fd.set("mother_id", subject.mother_id);
  }

  const created = await createPersonQuick(null, fd);
  if (!created?.success || !created.personId) {
    const field = created?.fieldErrors ? Object.values(created.fieldErrors)[0] : undefined;
    return { success: false, error: created?.error ?? field };
  }
  if (slot === "partner" && opts.status && opts.status !== "current") {
    const r = await linkSpouse(subject.id, created.personId, opts.status);
    if (!r.success) return { success: false, error: r.error, personId: created.personId };
  }
  return { success: true, personId: created.personId };
}

export async function linkExistingRelative(
  subject: PersonInput,
  slot: RelativeSlot,
  other: PersonInput,
  opts: { status?: PartnerStatus; coParent?: PersonInput | null; fatherId?: string | null } = {},
): Promise<LinkResult> {
  switch (slot) {
    case "father":
    case "mother":
      return linkParentChild(other.id, subject.id).then((r) => r ?? { success: false });
    case "partner":
      return linkSpouse(subject.id, other.id, opts.status ?? "current");
    case "sibling":
      return addSibling(subject.id, other.id);
    case "child": {
      const co = opts.coParent;
      if (!co) return linkChild(subject.id, other.id);
      const pair = parentSlots(subject, co, opts.fatherId);
      if (!pair) return { success: false, error: "Choose which parent is the father." };
      // Fill the empty slots only; linkChild refuses to overwrite a different parent.
      const first = await linkChild(pair.fatherId, other.id, "father_id");
      if (!first.success) return first;
      return linkChild(pair.motherId, other.id, "mother_id");
    }
  }
}

/** Parents two siblings share (removing a sibling clears these on the sibling). */
export function sharedParents(a: PersonInput, b: PersonInput): string[] {
  const out: string[] = [];
  if (a.father_id && a.father_id === b.father_id) out.push(a.father_id);
  if (a.mother_id && a.mother_id === b.mother_id) out.push(a.mother_id);
  return out;
}

export async function removeRelative(
  subject: PersonInput,
  slot: RelativeSlot,
  other: PersonInput,
  relationshipId?: string | null,
): Promise<LinkResult> {
  switch (slot) {
    case "father":
    case "mother":
      return unlinkParent(other.id, subject.id);
    case "child":
      return unlinkParent(subject.id, other.id);
    case "partner":
      if (!relationshipId) return { success: false };
      return deleteRelationship(relationshipId, subject.id).then((r) => r ?? { success: false });
    case "sibling": {
      for (const parentId of sharedParents(subject, other)) {
        const r = await unlinkParent(parentId, other.id);
        if (!r.success) return r;
      }
      return { success: true };
    }
  }
}

/**
 * "Change": link the right person, then drop the wrong one. Parents are the
 * exception (a child has one father slot), so the old parent is unlinked first
 * and put back if the new link fails.
 */
export async function replaceRelative(
  subject: PersonInput,
  slot: RelativeSlot,
  previous: PersonInput,
  next: PersonInput,
  opts: { relationshipId?: string | null; status?: PartnerStatus } = {},
): Promise<LinkResult> {
  if (slot === "father" || slot === "mother") {
    const off = await unlinkParent(previous.id, subject.id);
    if (!off.success) return off;
    const on = await linkParentChild(next.id, subject.id);
    if (!on?.success) {
      await linkParentChild(previous.id, subject.id);
      return on ?? { success: false };
    }
    return { success: true };
  }
  const on = await linkExistingRelative(subject, slot, next, { status: opts.status });
  if (!on.success) return on;
  return removeRelative(subject, slot, previous, opts.relationshipId);
}

export function setPartnerStatus(relationshipId: string, status: PartnerStatus): Promise<LinkResult> {
  return updateRelationshipStatus(relationshipId, status);
}
