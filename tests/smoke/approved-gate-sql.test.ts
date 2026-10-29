import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static checks on the privacy-gate migrations. The behaviour itself was run
// against a real Postgres (PGlite) while writing them; these guard the
// properties that are easy to break in a later edit.

const read = (f: string) => readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const gate = read("20260522000019_approved_family_gate.sql");
const hygiene = read("20260522000021_security_hygiene.sql");

function fn(sql: string, signature: string): string {
  const start = sql.indexOf(`create or replace function public.${signature}`);
  expect(start, `${signature} is defined`).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("20260522000019_approved_family_gate.sql", () => {
  it("adds approved_at / approved_by and approves every existing profile", () => {
    expect(gate).toMatch(/add column if not exists approved_at timestamptz/);
    expect(gate).toMatch(/add column if not exists approved_by uuid references public\.profiles\(id\)/);
    expect(gate).toMatch(/update public\.profiles set approved_at = now\(\) where approved_at is null/);
  });

  it("is_approved() is stable, security definer, pinned search_path; true for approved or admin", () => {
    const body = fn(gate, "is_approved()");
    expect(body).toMatch(/stable security definer set search_path = public/);
    expect(body).toMatch(/p\.approved_at is not null or p\.role = 'admin'/);
  });

  it.each([
    ["people", "people_select_authenticated", "people_select_approved"],
    ["events", "events_select_authenticated", "events_select_approved"],
    ["relationships", "relationships_select_authenticated", "relationships_select_approved"],
    ["transcripts", "transcripts_select_authenticated", "transcripts_select_approved"],
    ["extraction_proposals", "proposals_select_authenticated", "proposals_select_approved"],
  ])("%s SELECT: %s -> %s, gated on is_approved()", (table, oldName, newName) => {
    expect(gate).toContain(`drop policy if exists ${oldName} on public.${table};`);
    expect(gate).toMatch(
      new RegExp(`create policy ${newName} on public\\.${table}\\s+for select using \\(\\(select public\\.is_approved\\(\\)\\)\\)`),
    );
  });

  it("gates the photos and audio storage reads and leaves writes alone", () => {
    expect(gate).toMatch(/create policy "photos_approved_read" on storage\.objects\s+for select using \(bucket_id = 'photos' and \(select public\.is_approved\(\)\)\)/);
    expect(gate).toMatch(/create policy "audio_approved_read" on storage\.objects\s+for select using \(bucket_id = 'audio' and \(select public\.is_approved\(\)\)\)/);
    expect(gate).not.toMatch(/editor_insert|editor_delete/);
  });

  it("the guard stops non-admins changing approval and keeps the SECURITY INVOKER backend check", () => {
    const body = fn(gate, "guard_profile_privileged_columns()");
    expect(body).toMatch(/security invoker/i);
    expect(body).toContain("public.is_backend_role() or public.is_admin()");
    expect(body).toContain("new.approved_at is distinct from old.approved_at");
    expect(body).toContain("Admins always have access");
    expect(body).not.toMatch(/auth\.uid\(\)\s+is\s+null/i);
  });

  it("search_people_for_claim: definer, authenticated only, minimal columns, 20 rows, 2-char minimum", () => {
    const body = fn(gate, "search_people_for_claim(q text, dob date default null)");
    expect(body).toMatch(/security definer set search_path = public/);
    expect(body).toMatch(/char_length\(v_q\) < 2/);
    expect(body).toMatch(/limit 20/);
    expect(body).toContain("where s.total > 0"); // DOB alone can never surface someone
    expect(gate).toContain("revoke all on function public.search_people_for_claim(text, date) from public, anon;");
    expect(gate).toContain("grant execute on function public.search_people_for_claim(text, date) to authenticated;");
    // the returned columns: no slug, gender, full birth date, notes, photo, ids of parents
    const returns = body.slice(body.indexOf("returns table"), body.indexOf("language plpgsql"));
    for (const forbidden of ["birth_date", "slug", "gender", "notes", "photo", "father_id", "mother_id", "death"]) {
      expect(returns, forbidden).not.toContain(forbidden);
    }
    expect(returns).toContain("birth_year int");
  });

  it("excludes deleted and placeholder people from the claim cards", () => {
    const body = fn(gate, "_claim_cards()");
    expect(body).toContain("p.deleted_at is null and not p.is_placeholder");
    expect(gate).toContain("revoke all on function public._claim_cards() from public, anon, authenticated;");
  });
});

describe("20260522000021_security_hygiene.sql", () => {
  it.each([
    "handle_new_user()",
    "log_audit()",
    "log_audit_profiles()",
    "guard_profile_privileged_columns()",
    "guard_link_request()",
    "guard_relative_suggestion()",
    "refresh_person_groups()",
  ])("%s is not an RPC endpoint", (sig) => {
    expect(hygiene).toContain(`revoke execute on function public.${sig} from public, anon, authenticated;`);
  });

  it("RLS helpers stay callable by authenticated but not anon", () => {
    for (const f of ["is_admin()", "is_approved()", "is_backend_role()"]) {
      expect(hygiene).toContain(`revoke execute on function public.${f} from public, anon;`);
      expect(hygiene).toContain(`grant execute on function public.${f} to authenticated, service_role;`);
    }
  });

  it("keeps account deletion working for supabase_auth_admin", () => {
    expect(hygiene).toMatch(/supabase_auth_admin/);
  });

  it("pins set_updated_at's search_path and closes the person_groups view", () => {
    expect(hygiene).toContain("alter function public.set_updated_at() set search_path = '';");
    expect(hygiene).toContain("revoke all on public.person_groups from public, anon, authenticated;");
  });

  it("only touches rls_auto_enable where it exists", () => {
    expect(hygiene).toContain("to_regprocedure('public.rls_auto_enable()') is not null");
  });
});
