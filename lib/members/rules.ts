// Business rules for member accounts, expressed as pure functions.
//
// The database enforces the same rules with triggers (see
// supabase/migrations/20260521000016_profile_guard.sql and
// 20260521000017_link_requests.sql). These functions mirror them so the server
// actions can fail fast with a friendly message and so the rules can be
// unit-tested without a database.

import type { LinkRequestStatus, MemberRole } from "./types";

// ── link request state machine ──────────────────────────────────────────────

export type RequestActor = "owner" | "admin";

const ADMIN_TARGETS: LinkRequestStatus[] = ["approved", "declined", "cancelled"];

/**
 * pending -> cancelled   (the member, or an admin)
 * pending -> approved    (admin only)
 * pending -> declined    (admin only)
 * approved / declined / cancelled are final.
 */
export function canTransitionRequest(
  actor: RequestActor,
  from: LinkRequestStatus,
  to: LinkRequestStatus,
): boolean {
  if (from !== "pending") return false;
  if (actor === "owner") return to === "cancelled";
  return ADMIN_TARGETS.includes(to);
}

// ── protected profile columns ───────────────────────────────────────────────

export type ProfileSnapshot = { id: string; role: MemberRole; person_id: string | null };

export type ProfileGuardResult = { ok: true } | { ok: false; reason: string };

/**
 * Who may change profiles.role / profiles.person_id?
 *
 * `actor` is the caller as the database sees them:
 *  - "service" : service role key / sign-up trigger / migration (auth.uid() is null)
 *  - "admin"   : a signed-in admin
 *  - "member"  : any other signed-in user (viewer / editor), including on their own row
 */
export function guardProfileUpdate(
  actor: "service" | "admin" | "member",
  before: ProfileSnapshot,
  after: Pick<ProfileSnapshot, "role" | "person_id">,
): ProfileGuardResult {
  const touchesPrivileged = after.role !== before.role || after.person_id !== before.person_id;
  if (touchesPrivileged && actor === "member") {
    return { ok: false, reason: "Only an admin can change role or person_id" };
  }
  return { ok: true };
}

/** Would this role change leave the site without any admin? */
export function wouldRemoveLastAdmin(
  profiles: Array<{ id: string; role: MemberRole }>,
  targetId: string,
  newRole: MemberRole,
): boolean {
  const target = profiles.find((p) => p.id === targetId);
  if (!target || target.role !== "admin" || newRole === "admin") return false;
  return !profiles.some((p) => p.id !== targetId && p.role === "admin");
}

// ── friendly role labels ────────────────────────────────────────────────────

export const ROLE_ORDER: MemberRole[] = ["viewer", "editor", "admin"];

export function roleLabel(role: MemberRole, lang: "ar" | "en"): string {
  switch (role) {
    case "viewer":
      return lang === "ar" ? "عرض وإضافة ذكريات" : "View & add memories";
    case "editor":
      return lang === "ar" ? "تعديل الشجرة" : "Edit the tree";
    case "admin":
      return lang === "ar" ? "مشرف" : "Admin";
  }
}
