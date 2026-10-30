import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_ONLY_DELETE, OUT_OF_SCOPE, scopeErrorMessage, writeErrorMessage } from "@/lib/people/write-errors";

// Static checks on the family-scope migration. Its behaviour was run against a
// real Postgres (PGlite) with a three-generation family while writing it
// (59 cases: editing in and out of scope, re-parenting tricks found in review,
// deletes, claimed cards, storage, viewers, admins); these guard the properties
// that are easy to break in a later edit.

const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260601000031_scoped_editing.sql"), "utf8");

function fn(signature: string): string {
  const start = sql.indexOf(`create or replace function public.${signature}`);
  expect(start, `${signature} is defined`).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("20260601000031_scoped_editing.sql", () => {
  it("records who added each person, defaulting to the caller", () => {
    expect(sql).toMatch(/add column if not exists created_by uuid references auth\.users\(id\) on delete set null default auth\.uid\(\)/);
  });

  it("the scope covers self, parents, grandparents, children, grandchildren, siblings and spouses (not ex-spouses), never deleted people", () => {
    const body = fn("family_scope(p_me uuid)");
    for (const part of ["me as", "parents as", "grandparents as", "children as", "grandchildren as", "siblings as", "spouses as"]) {
      expect(body).toContain(part);
    }
    expect(body.match(/deleted_at is null/g)?.length).toBeGreaterThanOrEqual(6);
    expect(body).toMatch(/stable security definer set search_path = public/);
    expect(body).toMatch(/coalesce\(r\.status, 'current'\) <> 'divorced'/);
  });

  it("can_edit_person: admins yes; approved editors their scope or people they added; everyone else no", () => {
    const body = fn("can_edit_person(p_target uuid)");
    expect(body).toMatch(/if public\.is_admin\(\) then\s+return true;/);
    expect(body).toMatch(/if not public\.is_approved\(\) then\s+return false;/);
    expect(body).toMatch(/if v_role is distinct from 'editor' then\s+return false;/);
    expect(body).toMatch(/pe\.created_by = auth\.uid\(\)/);
    // People they added stop counting once another member's account is linked to the card.
    expect(body).toMatch(/pr\.person_id = pe\.id and pr\.id <> auth\.uid\(\)/);
    expect(body).toMatch(/public\.family_scope\(v_me\)/);
  });

  it("the helpers are not callable by anonymous visitors; family_scope not by members either (it reveals links)", () => {
    for (const f of ["family_scope(uuid)", "can_edit_person(uuid)", "my_editable_person_ids()", "delete_person(uuid)"]) {
      expect(sql).toContain(`revoke execute on function public.${f} from public, anon;`);
    }
    expect(sql).toContain("revoke execute on function public.family_scope(uuid) from authenticated;");
    expect(sql).not.toContain("grant execute on function public.family_scope(uuid) to authenticated;");
  });

  it("people: the old blanket editor policy is gone; insert by editors, update in scope, hard delete by admins", () => {
    expect(sql).toContain("drop policy if exists people_write_editor on public.people;");
    expect(sql).toMatch(/create policy people_update_scoped on public\.people\s+for update using \(public\.can_edit_person\(id\)\) with check \(public\.can_edit_person\(id\)\)/);
    expect(sql).toMatch(/create policy people_delete_admin on public\.people\s+for delete using \(public\.is_admin\(\)\)/);
    expect(sql).toMatch(/create policy people_insert_editor on public\.people\s+for insert with check/);
  });

  it("the guard trigger runs before insert and update, skips admins and the backend, and blocks scope-widening links", () => {
    const body = fn("guard_people_scope()");
    expect(body).toMatch(/if public\.is_backend_role\(\) or public\.is_admin\(\) then\s+return new;/);
    expect(body).toMatch(/new\.created_by := auth\.uid\(\)/);
    expect(body).toMatch(/new\.created_by is distinct from old\.created_by/);
    expect(body).toMatch(/new\.deleted_at is distinct from old\.deleted_at\s+and \(old\.created_by is distinct from auth\.uid\(\)\s+or exists \(select 1 from public\.profiles pr where pr\.person_id = old\.id\)\)/);
    expect(body).toMatch(/if not public\.can_edit_person\(v_new\) then/);
    // Re-parenting your own card: the new parent's children and parents must already be editable,
    // whoever added the card (no created_by exemption: that was the review's widening chain).
    const reparent = body.slice(body.indexOf("and new.id = v_me"), body.indexOf("Only an admin can link you to this parent"));
    expect(reparent).toMatch(/c\.father_id = v_new or c\.mother_id = v_new/);
    expect(reparent).toMatch(/pp\.father_id is not null and not public\.can_edit_person\(pp\.father_id\)/);
    expect(reparent).not.toMatch(/created_by/);
    expect(body).toMatch(/v_new = v_me/);
    expect(sql).toMatch(/create trigger people_guard_scope\s+before insert or update on public\.people/);
  });

  it("relationships and life events need both / the person in scope; memories stay open to editors", () => {
    expect(sql).toContain("drop policy if exists relationships_write_editor on public.relationships;");
    expect(sql).toMatch(/public\.can_edit_person\(person_a_id\) and public\.can_edit_person\(person_b_id\)/);
    expect(sql).toContain("drop policy if exists events_write_editor on public.events;");
    expect(sql).toMatch(/create policy events_write_scoped on public\.events\s+for all\s+using \(public\.can_edit_person\(person_id\)\)/);
    expect(sql).toMatch(/create policy events_write_memory_editor on public\.events[\s\S]*type = 'notable_story'/);
  });

  it("birth order: the parent and every child must be editable, so an order is never half-saved", () => {
    const body = fn("set_children_order(p_parent uuid, p_children uuid[])");
    expect(body).toMatch(/if not public\.can_edit_person\(p_parent\) then/);
    expect(body).toMatch(/where not public\.can_edit_person\(c\)/);
  });
});

describe("deleting and photos", () => {
  it("delete_person checks permission before touching any link", () => {
    const body = fn("delete_person(p_id uuid)");
    const check = body.indexOf("Only an admin can delete this person");
    expect(check).toBeGreaterThan(0);
    expect(body.indexOf("set father_id = null")).toBeGreaterThan(check);
    // It skips RLS when clearing links, so editors may only delete people whose children are all in their scope.
    const children = body.indexOf("some of their children are outside your family");
    expect(children).toBeGreaterThan(check);
    expect(body.indexOf("set father_id = null")).toBeGreaterThan(children);
    expect(body).toMatch(/pe\.created_by = auth\.uid\(\)\s+and not exists \(select 1 from public\.profiles pr where pr\.person_id = pe\.id\)/);
  });

  it("profile photo uploads and deletes follow the person's scope, with a cast that never errors", () => {
    expect(sql).toMatch(/create policy "photos_editor_insert" on storage\.objects/);
    expect(sql).toMatch(/create policy "photos_editor_delete" on storage\.objects/);
    expect(sql.match(/when \(storage\.foldername\(name\)\)\[1\] ~ '\^\[0-9a-f\]\{8\}/g)?.length).toBe(2);
  });
});

describe("write errors", () => {
  it("our guards' messages pass through; RLS refusals become the plain scope message", () => {
    expect(scopeErrorMessage({ hint: "out_of_scope_link", message: "Only an admin can link this." })).toBe("Only an admin can link this.");
    expect(scopeErrorMessage({ hint: "admin_only_delete", message: "x" })).toBe(ADMIN_ONLY_DELETE);
    expect(scopeErrorMessage({ code: "42501", message: "permission denied" })).toBe(OUT_OF_SCOPE);
    expect(scopeErrorMessage({ message: 'new row violates row-level security policy for table "people"' })).toBe(OUT_OF_SCOPE);
    expect(scopeErrorMessage({ code: "23505", message: "duplicate" })).toBeNull();
    expect(scopeErrorMessage(null)).toBeNull();
  });

  it("anything else keeps the database's own message", () => {
    expect(writeErrorMessage({ code: "23505", message: "duplicate key" })).toBe("duplicate key");
    expect(writeErrorMessage(null)).toBe("Something went wrong. Please try again.");
  });
});
