// Who may do what on /admin/members, as one pure function. The database guard
// (supabase/migrations/20260522000022_super_admin.sql) enforces the same rules;
// server actions call these first so people get a friendly message instead of a
// raw database error, and the UI uses them to HIDE (not just disable) the
// owner-only buttons.

import type { MemberRole } from "./types";

export type Caller = "viewer" | "editor" | "admin" | "super_admin";

export type AdminAction =
  | "review_requests" // approve, decline, pick someone else, add to tree & link
  | "link_members" // link / unlink an account to a person
  | "let_in" // "Let in without linking"
  | "remove_access" // clear approved_at (back to waiting)
  | "review_suggestions"
  | "add_family_member" // a person with no account
  | "change_role" // viewer <-> editor
  | "change_admin_role" // anything to or from Admin
  | "invite_member" // add a member by email (service role)
  | "delete_account" // delete the account entirely (service role)
  | "reset_pin" // give a PIN-login member a new temporary PIN (service role)
  | "family_pin"; // see / change the shared family PIN

const SUPER_ONLY: ReadonlySet<AdminAction> = new Set(["change_admin_role", "invite_member", "delete_account", "family_pin"]);

const ADMIN_ACTIONS: ReadonlySet<AdminAction> = new Set([
  "review_requests",
  "link_members",
  "let_in",
  "remove_access",
  "review_suggestions",
  "add_family_member",
  "change_role",
  "reset_pin",
]);

/** Derive the caller from what the profile says. */
export function callerOf(profile: { role: MemberRole; is_super_admin?: boolean | null }): Caller {
  if (profile.is_super_admin) return "super_admin";
  return profile.role;
}

/** Does the caller have this power at all (ignoring who it is aimed at)? */
export function can(caller: Caller, action: AdminAction): boolean {
  if (caller === "super_admin") return true;
  if (caller === "admin") return ADMIN_ACTIONS.has(action) && !SUPER_ONLY.has(action);
  return false;
}

export type Target = {
  id: string;
  role: MemberRole;
  isSuperAdmin: boolean;
  /** Only needed for reset_pin: PINs can only be reset on PIN accounts. */
  loginMethod?: "email" | "pin";
};

export type Verdict = { ok: true } | { ok: false; reason: "forbidden" | "self" | "super_admin" | "admin" | "same_role" | "not_pin" };

/**
 * Can `caller` (whose own profile id is `callerId`) do `action` to `target`?
 * For `change_role`/`change_admin_role` pass the role they would get in `newRole`.
 */
export function canActOn(
  caller: Caller,
  callerId: string,
  action: AdminAction,
  target: Target,
  newRole?: MemberRole,
): Verdict {
  if (!can(caller, action)) return { ok: false, reason: "forbidden" };

  switch (action) {
    case "remove_access":
      // Access is cleared for non-admins only; admins always have access.
      if (target.role === "admin" || target.isSuperAdmin) return { ok: false, reason: "admin" };
      return { ok: true };

    case "reset_pin":
      // PIN accounts only; never your own (use "Change my PIN"); an admin's PIN is the owner's call.
      if (target.loginMethod !== "pin") return { ok: false, reason: "not_pin" };
      if (target.id === callerId) return { ok: false, reason: "self" };
      if ((target.role === "admin" || target.isSuperAdmin) && caller !== "super_admin") return { ok: false, reason: "admin" };
      return { ok: true };

    case "delete_account":
      if (target.id === callerId) return { ok: false, reason: "self" };
      if (target.isSuperAdmin) return { ok: false, reason: "super_admin" };
      return { ok: true };

    case "change_role":
    case "change_admin_role": {
      if (target.isSuperAdmin) return { ok: false, reason: "super_admin" };
      if (newRole && newRole === target.role) return { ok: false, reason: "same_role" };
      const touchesAdmin = target.role === "admin" || newRole === "admin";
      // Anything to or from Admin is owner-only, whatever action name was used.
      if (touchesAdmin && caller !== "super_admin") return { ok: false, reason: "forbidden" };
      if (!touchesAdmin && !can(caller, "change_role")) return { ok: false, reason: "forbidden" };
      return { ok: true };
    }

    default:
      return { ok: true };
  }
}

/** The name an admin must type to confirm deleting an account. */
export function confirmationName(p: { full_name?: string | null; display_name?: string | null; email?: string | null }): string {
  return (p.full_name ?? p.display_name ?? p.email?.split("@")[0] ?? "").trim();
}

/** Typed confirmation: case-insensitive, whitespace-collapsed, never empty. */
export function confirmationMatches(typed: string, expected: string): boolean {
  const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const e = norm(expected);
  return e.length > 0 && norm(typed) === e;
}

/** Postgres refused because a super admin is involved (hint set by the guard trigger). */
export function isSuperAdminGuardError(
  error: { hint?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  return (
    error.hint === "super_admin_required" ||
    error.hint === "super_admin_protected" ||
    error.hint === "last_super_admin" ||
    /super admin/i.test(error.message ?? "")
  );
}
