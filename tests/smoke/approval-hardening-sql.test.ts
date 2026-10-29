import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static checks on 20260522000023_approval_hardening.sql (security review).
// Behaviour was verified against a real Postgres (PGlite) with migrations 1-23:
// an editor whose access was removed reads 0 people and cannot insert; a
// caller-supplied date can no longer flip dob_match to 'exact'.

const read = (f: string) => readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const sql = read("20260522000023_approval_hardening.sql");

const APPROVED = "(select public.is_approved())";

/** The text of one `create policy` statement, up to its terminating semicolon. */
function policy(name: string, table: string): string {
  const start = sql.indexOf(`create policy ${name} on ${table}`);
  expect(start, `${name} is (re)created`).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf(";", start));
}

describe("20260522000023_approval_hardening.sql", () => {
  // FOR ALL policies also grant SELECT, so every one of them must require approval
  // in both USING and WITH CHECK, or "Remove access" does nothing for editors.
  it.each([
    ["people_write_editor", "public.people"],
    ["events_write_editor", "public.events"],
    ["relationships_write_editor", "public.relationships"],
    ["transcripts_write_editor", "public.transcripts"],
    ["proposals_write_editor", "public.extraction_proposals"],
  ])("%s requires is_approved() for reads and writes", (name, table) => {
    expect(sql).toContain(`drop policy if exists ${name} on ${table};`);
    const body = policy(name, table);
    expect(body).toMatch(/for all using \(/);
    const [using, check] = body.split("with check");
    expect(using).toContain(APPROVED);
    expect(check).toContain(APPROVED);
    expect(body).toContain("p.role in ('admin', 'editor')");
  });

  it.each([
    ['"photos_editor_insert"', "photos"],
    ['"photos_editor_delete"', "photos"],
    ['"audio_editor_insert"', "audio"],
    ['"audio_editor_delete"', "audio"],
  ])("storage policy %s requires is_approved()", (name, bucket) => {
    const body = policy(name, "storage.objects");
    expect(body).toContain(`bucket_id = '${bucket}'`);
    expect(body).toContain(APPROVED);
  });

  it("search_people_for_claim ranks by the caller's own profile DOB, never the argument", () => {
    const start = sql.indexOf("create or replace function public.search_people_for_claim(q text, dob date default null)");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toMatch(/security definer set search_path = public/);
    expect(body).not.toMatch(/v_dob\s+date\s*:=\s*dob/);
    expect(body).toMatch(/select pr\.date_of_birth into v_dob from public\.profiles pr where pr\.id = auth\.uid\(\)/);
    // Still the same narrow surface as 20260522000019.
    expect(body).toMatch(/char_length\(v_q\) < 2/);
    expect(body).toMatch(/limit 20/);
    expect(body).toContain("where s.total > 0");
    const returns = body.slice(body.indexOf("returns table"), body.indexOf("language plpgsql"));
    for (const forbidden of ["birth_date", "slug", "gender", "notes", "photo", "father_id", "mother_id"]) {
      expect(returns, forbidden).not.toContain(forbidden);
    }
    expect(sql).toContain("revoke all on function public.search_people_for_claim(text, date) from public, anon;");
    expect(sql).toContain("grant execute on function public.search_people_for_claim(text, date) to authenticated;");
  });
});
