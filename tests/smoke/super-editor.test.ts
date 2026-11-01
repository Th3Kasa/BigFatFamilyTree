import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { profileRoleOf, ROLE_CHOICES, roleChoiceOf } from "@/lib/members/rules";
import { memberRoleSchema } from "@/lib/validation/members";

// Static checks on migration 35. Its behaviour was run against PGlite with the
// three-generation family from migration 31 (super editors edit and link anyone,
// still can't delete or grant the flag; editors keep their close-family scope;
// unapproved or demoted super editors get nothing).

const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260605000035_super_editor.sql"), "utf8");

function fn(signature: string): string {
  const start = sql.indexOf(`create or replace function public.${signature}`);
  expect(start, `${signature} is defined`).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("20260605000035_super_editor.sql", () => {
  it("new members are editors, and existing viewers become editors", () => {
    expect(sql).toContain("alter table public.profiles alter column role set default 'editor';");
    const body = fn("handle_new_user()");
    expect(body).not.toContain("'viewer'");
    expect(body.match(/'editor'/g)?.length).toBe(2);
    expect(sql).toContain("update public.profiles set role = 'editor' where role = 'viewer';");
  });

  it("only admins or the backend set the flag, and it is cleared off editors", () => {
    const body = fn("guard_profile_super_editor()");
    expect(body).toMatch(/if new\.role is distinct from 'editor' then\s+new\.is_super_editor := false;/);
    expect(body).toMatch(/if not \(public\.is_backend_role\(\) or public\.is_admin\(\)\) then/);
    expect(sql).toMatch(/create trigger profiles_guard_super_editor\s+before insert or update on public\.profiles/);
  });

  it("super editors must be approved editors, and may edit everyone", () => {
    expect(fn("is_super_editor()")).toMatch(/p\.role = 'editor' and p\.is_super_editor[\s\S]*and public\.is_approved\(\)/);
    expect(fn("can_edit_person(p_target uuid)")).toMatch(/if public\.is_admin\(\) or public\.is_super_editor\(\) then\s+return true;/);
    expect(fn("my_editable_person_ids()")).toMatch(/if public\.is_admin\(\) or public\.is_super_editor\(\) then\s+return null;/);
  });

  it("gives no delete or admin powers (delete_person and the people guard are untouched)", () => {
    expect(sql).not.toContain("function public.delete_person");
    expect(sql).not.toContain("function public.guard_people_scope");
    expect(sql).not.toContain("guard_profile_privileged_columns");
  });
});

describe("Super editor in the members table", () => {
  it("is stored as an editor with the flag", () => {
    expect(profileRoleOf("super_editor")).toEqual({ role: "editor", is_super_editor: true });
    expect(profileRoleOf("editor")).toEqual({ role: "editor", is_super_editor: false });
    expect(profileRoleOf("admin")).toEqual({ role: "admin", is_super_editor: false });
  });

  it("reads back from the profile", () => {
    expect(roleChoiceOf({ role: "editor", superEditor: true })).toBe("super_editor");
    expect(roleChoiceOf({ role: "editor", superEditor: false })).toBe("editor");
    // The flag means nothing on other roles.
    expect(roleChoiceOf({ role: "viewer", superEditor: true })).toBe("viewer");
  });

  it("sits between Editor and Admin, and the role action accepts it", () => {
    expect(ROLE_CHOICES).toEqual(["viewer", "editor", "super_editor", "admin"]);
    expect(memberRoleSchema.safeParse({ profileId: "00000000-0000-4000-8000-000000000001", role: "super_editor" }).success).toBe(true);
  });
});
