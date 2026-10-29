import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  callerOf,
  can,
  canActOn,
  confirmationMatches,
  confirmationName,
  isSuperAdminGuardError,
  type AdminAction,
  type Caller,
  type Target,
} from "@/lib/members/permissions";
import { deleteMemberSchema, inviteMemberSchema } from "@/lib/validation/members";

const callers: Caller[] = ["viewer", "editor", "admin", "super_admin"];

describe("permission matrix: caller x action", () => {
  // true = allowed (before looking at who the action is aimed at)
  const matrix: Record<AdminAction, [boolean, boolean, boolean, boolean]> = {
    //                      viewer editor admin  super
    review_requests: [false, false, true, true],
    link_members: [false, false, true, true],
    let_in: [false, false, true, true],
    remove_access: [false, false, true, true],
    review_suggestions: [false, false, true, true],
    add_family_member: [false, false, true, true],
    change_role: [false, false, true, true],
    change_admin_role: [false, false, false, true],
    invite_member: [false, false, false, true],
    delete_account: [false, false, false, true],
    reset_pin: [false, false, true, true],
    family_pin: [false, false, false, true],
  };

  for (const [action, row] of Object.entries(matrix) as Array<[AdminAction, boolean[]]>) {
    it(`${action}: viewer/editor/admin/super_admin = ${row.join("/")}`, () => {
      callers.forEach((c, i) => expect(can(c, action), `${c} ${action}`).toBe(row[i]));
    });
  }

  it("callerOf: the super admin flag wins, otherwise the role", () => {
    expect(callerOf({ role: "admin", is_super_admin: true })).toBe("super_admin");
    expect(callerOf({ role: "admin", is_super_admin: false })).toBe("admin");
    expect(callerOf({ role: "editor" })).toBe("editor");
    expect(callerOf({ role: "viewer", is_super_admin: null })).toBe("viewer");
  });
});

describe("permission matrix: who it is aimed at", () => {
  const me = "me";
  const viewer: Target = { id: "v", role: "viewer", isSuperAdmin: false };
  const editor: Target = { id: "e", role: "editor", isSuperAdmin: false };
  const admin: Target = { id: "a", role: "admin", isSuperAdmin: false };
  const owner: Target = { id: "o", role: "admin", isSuperAdmin: true };
  const self: Target = { id: me, role: "admin", isSuperAdmin: true };

  it("Remove access works for non-admins only (admin and super admin callers alike)", () => {
    for (const c of ["admin", "super_admin"] as const) {
      expect(canActOn(c, me, "remove_access", viewer).ok).toBe(true);
      expect(canActOn(c, me, "remove_access", editor).ok).toBe(true);
      expect(canActOn(c, me, "remove_access", admin)).toEqual({ ok: false, reason: "admin" });
      expect(canActOn(c, me, "remove_access", owner)).toEqual({ ok: false, reason: "admin" });
    }
    expect(canActOn("editor", me, "remove_access", viewer).ok).toBe(false);
  });

  it("Delete account is owner-only, never yourself, never another super admin", () => {
    expect(canActOn("super_admin", me, "delete_account", viewer).ok).toBe(true);
    expect(canActOn("super_admin", me, "delete_account", admin).ok).toBe(true);
    expect(canActOn("super_admin", me, "delete_account", self)).toEqual({ ok: false, reason: "self" });
    expect(canActOn("super_admin", me, "delete_account", owner)).toEqual({ ok: false, reason: "super_admin" });
    for (const c of ["viewer", "editor", "admin"] as const) {
      expect(canActOn(c, me, "delete_account", viewer)).toEqual({ ok: false, reason: "forbidden" });
    }
  });

  it("Admins can switch Viewer <-> Editor but not touch the Admin role", () => {
    expect(canActOn("admin", me, "change_role", viewer, "editor").ok).toBe(true);
    expect(canActOn("admin", me, "change_role", editor, "viewer").ok).toBe(true);
    expect(canActOn("admin", me, "change_role", viewer, "admin")).toEqual({ ok: false, reason: "forbidden" });
    expect(canActOn("admin", me, "change_role", admin, "viewer")).toEqual({ ok: false, reason: "forbidden" });
  });

  it("the owner can create and remove admins, but never demote the owner", () => {
    expect(canActOn("super_admin", me, "change_role", viewer, "admin").ok).toBe(true);
    expect(canActOn("super_admin", me, "change_role", admin, "viewer").ok).toBe(true);
    expect(canActOn("super_admin", me, "change_role", owner, "viewer")).toEqual({ ok: false, reason: "super_admin" });
    expect(canActOn("super_admin", me, "change_admin_role", self, "viewer")).toEqual({ ok: false, reason: "super_admin" });
  });

  it("a no-op role change is refused", () => {
    expect(canActOn("admin", me, "change_role", viewer, "viewer")).toEqual({ ok: false, reason: "same_role" });
  });
});

describe("typed-name confirmation for deleting an account", () => {
  it("falls back from full name to display name to the email's first part", () => {
    expect(confirmationName({ full_name: " Omar Haddad ", display_name: "omar" })).toBe("Omar Haddad");
    expect(confirmationName({ full_name: null, display_name: "omar" })).toBe("omar");
    expect(confirmationName({ email: "omar.h@example.com" })).toBe("omar.h");
  });
  it("matches case-insensitively and ignores extra spaces", () => {
    expect(confirmationMatches("  omar   haddad ", "Omar Haddad")).toBe(true);
  });
  it("does not match a different or partial name, or an empty one", () => {
    expect(confirmationMatches("Omar", "Omar Haddad")).toBe(false);
    expect(confirmationMatches("", "")).toBe(false);
    expect(confirmationMatches("anything", "")).toBe(false);
  });
});

describe("super admin guard errors from Postgres", () => {
  it("recognises the hints the trigger raises", () => {
    expect(isSuperAdminGuardError({ hint: "super_admin_required" })).toBe(true);
    expect(isSuperAdminGuardError({ hint: "super_admin_protected" })).toBe(true);
    expect(isSuperAdminGuardError({ hint: "last_super_admin" })).toBe(true);
    expect(isSuperAdminGuardError({ message: "Only a super admin can create or remove admins" })).toBe(true);
    expect(isSuperAdminGuardError({ message: "boom" })).toBe(false);
    expect(isSuperAdminGuardError(null)).toBe(false);
  });
});

describe("20260522000022_super_admin.sql (guard rules)", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260522000022_super_admin.sql"), "utf8");
  const guard = (() => {
    const start = sql.indexOf("create or replace function public.guard_profile_privileged_columns()");
    return sql.slice(start, sql.indexOf("$$;", start));
  })();

  it("sets the flag for the owner by lower-cased auth email", () => {
    expect(sql).toMatch(/lower\(u\.email\) = 'basemmorkos98@gmail\.com'/);
    expect(sql).toMatch(/set is_super_admin = true/);
  });
  it("is_super_admin() is security definer, pinned search_path, authenticated only (not anon)", () => {
    const start = sql.indexOf("create or replace function public.is_super_admin()");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toMatch(/security definer set search_path = public/);
    expect(sql).toContain("revoke execute on function public.is_super_admin() from public, anon;");
    expect(sql).toContain("grant execute on function public.is_super_admin() to authenticated, service_role;");
  });
  it("is_admin() is true for a super admin", () => {
    expect(sql).toMatch(/p\.role = 'admin' or p\.is_super_admin/);
  });
  it("only a backend role can change the flag, demote or delete a super admin", () => {
    expect(guard).toContain("Only the backend can change is_super_admin");
    expect(guard).toContain("A super admin cannot be demoted");
    expect(guard).toContain("A super admin cannot be deleted");
    expect(guard).toContain("Only a super admin can delete accounts");
  });
  it("never leaves zero super admins, and the check is serialised", () => {
    expect(guard).toContain("pg_advisory_xact_lock(hashtext('profiles_last_super_admin'))");
    expect(guard).toContain("Cannot remove the last super admin");
  });
  it("creating or removing an admin needs a super admin", () => {
    expect(guard).toContain("Only a super admin can create or remove admins");
  });
  it("deleting an account no longer fails on contributed stories or uploads", () => {
    expect(sql).toMatch(/on delete set null/);
    expect(sql).toContain("alter table public.transcripts alter column uploaded_by drop not null");
  });
});

describe("invite input validation", () => {
  const ok = { fullName: "Omar Haddad", email: "Omar@Example.com", role: "viewer" as const };

  it("accepts the minimum and normalises the email; approve now defaults to on", () => {
    const r = inviteMemberSchema.safeParse(ok);
    expect(r.success && r.data).toMatchObject({
      fullName: "Omar Haddad",
      email: "omar@example.com",
      dateOfBirth: null,
      personId: null,
      role: "viewer",
      approveNow: true,
    });
  });
  it("accepts every optional field", () => {
    const r = inviteMemberSchema.safeParse({
      ...ok,
      role: "editor",
      dateOfBirth: "1990-02-03",
      personId: "550e8400-e29b-41d4-a716-446655440001",
      approveNow: false,
    });
    expect(r.success && r.data).toMatchObject({ role: "editor", dateOfBirth: "1990-02-03", approveNow: false });
  });
  it("treats an empty date of birth and person as not given", () => {
    const r = inviteMemberSchema.safeParse({ ...ok, dateOfBirth: "", personId: "" });
    expect(r.success && r.data).toMatchObject({ dateOfBirth: null, personId: null });
  });
  it("rejects a bad email, a short name, a bad role, a future or impossible date, a non-UUID person", () => {
    expect(inviteMemberSchema.safeParse({ ...ok, email: "not-an-email" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ ...ok, fullName: "O" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ ...ok, role: "superuser" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ ...ok, dateOfBirth: "2999-01-01" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ ...ok, dateOfBirth: "1990-02-31" }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ ...ok, personId: "nope" }).success).toBe(false);
  });
  it("delete input needs a UUID and a typed name", () => {
    expect(deleteMemberSchema.safeParse({ profileId: "550e8400-e29b-41d4-a716-446655440001", confirmName: "Omar" }).success).toBe(true);
    expect(deleteMemberSchema.safeParse({ profileId: "x", confirmName: "Omar" }).success).toBe(false);
    expect(deleteMemberSchema.safeParse({ profileId: "550e8400-e29b-41d4-a716-446655440001", confirmName: "  " }).success).toBe(false);
  });
});

describe("the service-role key stays on the server", () => {
  const root = path.resolve(__dirname, "../..");
  const skip = new Set(["node_modules", ".next", ".git", ".claude", "tests", "docs", "dogfood-output", "scripts", "supabase"]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }

  const files = ["app", "components", "lib"].flatMap((d) => walk(path.join(root, d)));
  const users = files.filter((f) => /createServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(readFileSync(f, "utf8")));

  it("finds the modules that use it", () => {
    expect(users.length).toBeGreaterThan(0);
  });

  it.each(users.map((f) => path.relative(root, f).replace(/\\/g, "/")))("%s is server-only", (rel) => {
    const src = readFileSync(path.join(root, rel), "utf8");
    // env.ts only DESCRIBES the variable; it is validated server-side and never sent to the browser.
    if (rel === "lib/env.ts") return;
    const serverOnly = /^\s*import\s+["']server-only["'];?/m.test(src);
    const useServer = /^\s*["']use server["'];?/m.test(src);
    expect(serverOnly || useServer, `${rel} must import "server-only" or be a "use server" module`).toBe(true);
    expect(/^\s*["']use client["']/m.test(src), `${rel} must not be a client module`).toBe(false);
  });

  it("no client component imports a service-role module", () => {
    const clients = files.filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")));
    for (const f of clients) {
      const src = readFileSync(f, "utf8");
      expect(src, path.relative(root, f)).not.toMatch(/supabase\/service|members\/account-admin|notify\/email/);
    }
  });

  it("the account-admin module is the owner-only door and says so", () => {
    const src = readFileSync(path.join(root, "lib/members/account-admin.ts"), "utf8");
    expect(src).toMatch(/import "server-only"/);
    expect(src).toContain("inviteUserByEmail");
    expect(src).toContain("deleteUser");
  });

  it("owner-only actions re-check is_super_admin on the server", () => {
    const src = readFileSync(path.join(root, "lib/actions/members.ts"), "utf8");
    for (const fn of ["inviteMember", "deleteMember"]) {
      const start = src.indexOf(`export async function ${fn}(`);
      expect(start, fn).toBeGreaterThan(-1);
      const body = src.slice(start, start + 600);
      expect(body, fn).toContain("getSuperAdminContext()");
    }
    const auth = readFileSync(path.join(root, "lib/members/auth.ts"), "utf8");
    expect(auth).toContain("is_super_admin");
    expect(auth).toMatch(/import "server-only"/);
  });
});
