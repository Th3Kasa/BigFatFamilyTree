import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static checks on the hardening migration. The behaviour itself was exercised
// against a real Postgres (PGlite) during the security review; these guard the
// properties that are easy to break in a later edit.

const sql = readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/20260521000018_member_hardening.sql"),
  "utf8",
);

/** The full `create or replace function public.<name>() ... $$;` statement. */
function fn(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  return sql.slice(start, end);
}

describe("20260521000018_member_hardening.sql", () => {
  it.each(["is_backend_role", "guard_profile_privileged_columns", "guard_link_request"])(
    "%s is SECURITY INVOKER (current_user must be the caller, not the owner)",
    (name) => {
      const body = fn(name);
      expect(body).toMatch(/security invoker/i);
      expect(body).not.toMatch(/security definer/i);
    },
  );

  it("guards no longer treat a null auth.uid() as privileged", () => {
    expect(fn("guard_profile_privileged_columns")).not.toMatch(/auth\.uid\(\)\s+is\s+null/i);
    expect(fn("guard_link_request")).not.toMatch(/auth\.uid\(\)\s+is\s+null/i);
    expect(fn("is_backend_role")).toMatch(/coalesce\(auth\.role\(\) = 'service_role', false\)/);
  });

  it("last-admin rule covers DELETE and is serialised", () => {
    const body = fn("guard_profile_privileged_columns");
    expect(body).toContain("tg_op = 'DELETE'");
    expect(body).toContain("pg_advisory_xact_lock(hashtext('profiles_last_admin'))");
    expect(body).toContain("hint = 'last_admin'");
    expect(sql).toMatch(/before insert or update or delete on public\.profiles/);
  });

  it("audit actor FK no longer blocks account deletion", () => {
    expect(sql).toMatch(/references public\.profiles\(id\) on delete set null/);
  });

  it("profile audit drops email and date_of_birth", () => {
    const body = fn("log_audit_profiles");
    expect(body).toContain("- 'email' - 'date_of_birth'");
    expect(sql).toMatch(/execute function public\.log_audit_profiles\(\)/);
  });

  it("date of birth floor is 1900 in the sign-up trigger and the constraint", () => {
    expect(fn("handle_new_user")).toContain("date '1900-01-01'");
    expect(fn("handle_new_user")).not.toContain("1800");
    expect(sql).toMatch(/profiles_date_of_birth_min[\s\S]*date_of_birth >= date '1900-01-01'/);
  });

  it("auth status RPC is admin-gated and not callable by anon", () => {
    expect(fn("admin_member_auth_status")).toContain("where public.is_admin()");
    expect(sql).toContain("revoke all on function public.admin_member_auth_status() from public, anon;");
  });
});
