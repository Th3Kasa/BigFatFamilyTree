// "Approved family only": pure rules for profiles.approved_at / approved_by,
// mirroring public.is_approved() and the profiles guard trigger
// (supabase/migrations/20260522000019_approved_family_gate.sql and
// 20260522000020_member_journey.sql). Unit-tested without a database.

import type { MemberRole } from "./types";

export type DbActor = "service" | "admin" | "member";

export type ApprovalSnapshot = {
  role: MemberRole;
  approved_at: string | null;
  approved_by: string | null;
  onboarded_at?: string | null;
  checklist_dismissed_at?: string | null;
};

/** public.is_approved(): approved by an admin, or an admin. */
export function isApproved(
  profile: { role?: MemberRole | string | null; approved_at?: string | null } | null | undefined,
): boolean {
  if (!profile) return false;
  return profile.approved_at != null || profile.role === "admin";
}

export type ApprovalGuardResult = { ok: true } | { ok: false; reason: string };

/**
 * Who may change approval (and the journey stamps)? Backend roles and admins
 * only. Whoever asks, an admin's access cannot be removed while they are an
 * admin ("demote them first").
 */
export function guardApprovalChange(
  actor: DbActor,
  before: ApprovalSnapshot,
  after: ApprovalSnapshot,
): ApprovalGuardResult {
  const touched =
    after.approved_at !== before.approved_at ||
    after.approved_by !== before.approved_by ||
    (after.onboarded_at ?? null) !== (before.onboarded_at ?? null) ||
    (after.checklist_dismissed_at ?? null) !== (before.checklist_dismissed_at ?? null);
  if (touched && actor === "member") {
    return { ok: false, reason: "Only an admin can change role, person_id or approval" };
  }
  if (after.role === "admin" && before.approved_at !== null && after.approved_at === null) {
    return { ok: false, reason: "Admins always have access" };
  }
  return { ok: true };
}

/** What the trigger stores in approved_by after an update. */
export function stampApprovedBy(
  before: Pick<ApprovalSnapshot, "approved_at">,
  after: Pick<ApprovalSnapshot, "approved_at" | "approved_by">,
  actorId: string | null,
): string | null {
  if (after.approved_at === null) return null;
  if (before.approved_at === null && after.approved_by === null) return actorId;
  return after.approved_by;
}

/** "Remove access" is refused for admins (UI hint and server-action check). */
export function canRemoveAccess(role: MemberRole): boolean {
  return role !== "admin";
}

/** Accounts shown under "Waiting for access": not approved, not an admin, and no request already waiting. */
export function needsAccessDecision(
  account: { id: string; role: MemberRole; approved: boolean },
  pendingRequestProfileIds: ReadonlySet<string>,
): boolean {
  return !account.approved && account.role !== "admin" && !pendingRequestProfileIds.has(account.id);
}

/**
 * Nav badge for admins: pending link requests + unapproved accounts that have
 * no request yet (so nobody is counted twice) + pending relative suggestions.
 */
export function countWaiting(input: {
  pendingRequestProfileIds: readonly string[];
  unapproved: ReadonlyArray<{ id: string; role: MemberRole }>;
  pendingSuggestions: number;
}): number {
  const withRequest = new Set(input.pendingRequestProfileIds);
  const noRequest = input.unapproved.filter((a) => a.role !== "admin" && !withRequest.has(a.id)).length;
  return withRequest.size + noRequest + input.pendingSuggestions;
}
