import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static checks on 20260523000026_pin_login.sql, plus the code that must stay in
// step with it. (The repo has no PGlite harness; the SQL was written against the
// same guard function as migration 24.)

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20260523000026_pin_login.sql");

describe("20260523000026_pin_login.sql", () => {
  it("adds the profile columns", () => {
    for (const col of ["first_name", "last_name", "login_method", "name_key", "pin_must_change"]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${col}\\b`));
    }
    expect(sql).toMatch(/login_method in \('email', 'pin'\)/);
    expect(sql).toMatch(/login_method text not null default 'email'/);
  });

  it("one PIN account per name + birthday (partial unique index)", () => {
    expect(sql).toMatch(
      /create unique index if not exists profiles_pin_identity_uidx\s+on public\.profiles \(name_key, date_of_birth\)\s+where login_method = 'pin'/,
    );
  });

  it("a PIN profile must carry a name key and a birthday", () => {
    expect(sql).toMatch(/login_method <> 'pin' or \(name_key is not null and date_of_birth is not null\)/);
  });

  it("handle_new_user builds PIN profiles only from server-set app metadata", () => {
    const start = sql.indexOf("create or replace function public.handle_new_user()");
    const body = sql.slice(start, sql.indexOf("end; $$;", start));
    expect(body).toContain("new.raw_app_meta_data->>'login'");
    expect(body).toContain("_claim_norm");
    // The user-editable metadata must not be able to switch on PIN mode.
    expect(body).not.toMatch(/raw_user_meta_data->>'login'/);
    expect(body).toMatch(/security definer set search_path = public/);
    // PIN accounts keep no email on the profile.
    expect(body).toMatch(/'viewer', 'pin'/);
  });

  it("the guard blocks members from changing login_method, name_key, birthday and the must-change flag", () => {
    const start = sql.indexOf("create or replace function public.guard_profile_privileged_columns()");
    const body = sql.slice(start, sql.indexOf("end; $$;", start));
    expect(body).toContain("new.login_method is distinct from old.login_method");
    expect(body).toContain("new.name_key is distinct from old.name_key");
    expect(body).toContain("new.pin_must_change is distinct from old.pin_must_change");
    expect(body).toMatch(/old\.login_method = 'pin' and \(\s+new\.date_of_birth is distinct from old\.date_of_birth/);
    expect(body).toContain("not v_backend");
    // Still invoker, and the earlier rules survive.
    expect(body).toMatch(/security invoker/);
    expect(body).toContain("Cannot remove the last super admin");
    expect(body).toContain("Only a super admin can create or remove admins");
    expect(body).toContain("Admins always have access");
  });

  it("family_settings: RLS on, admins read, only the super admin writes, nobody deletes", () => {
    expect(sql).toMatch(/alter table public\.family_settings enable row level security/);
    expect(sql).toMatch(/revoke all on public\.family_settings from public, anon/);
    expect(sql).toMatch(/grant select, insert, update on public\.family_settings to authenticated/);
    expect(sql).toMatch(/family_settings_select_admin on public\.family_settings\s+for select using \(\(select public\.is_admin\(\)\)\)/);
    expect(sql).toMatch(/family_settings_insert_super[\s\S]*for insert with check \(\(select public\.is_super_admin\(\)\)\)/);
    expect(sql).toMatch(/family_settings_update_super[\s\S]*for update using \(\(select public\.is_super_admin\(\)\)\)/);
    expect(sql).not.toMatch(/for delete/);
    expect(sql).not.toMatch(/grant [^;]*delete[^;]*family_settings/);
  });
});

describe("PIN code stays in step with the database and the brief", () => {
  it("the unique index name in code matches the migration", () => {
    const code = read("lib/auth/pin-validation.ts");
    expect(code).toContain('PIN_IDENTITY_INDEX = "profiles_pin_identity_uidx"');
    expect(sql).toContain("profiles_pin_identity_uidx");
  });

  it("accounts are created server-side with the agreed shape", () => {
    const code = read("lib/auth/pin-session.ts");
    expect(code).toContain("auth.admin.createUser");
    expect(code).toContain("email_confirm: true");
    expect(code).toContain('login: "pin"');
    expect(code).toContain("app_metadata");
    expect(code).toContain("derivePinPassword(userId, pin, secret)");
    // the PIN is never the password
    expect(code).not.toMatch(/password:\s*pin\b/);
  });

  it("the HMAC key has its own label", () => {
    expect(read("lib/auth/pin-crypto.ts")).toContain("`bff-pin:${secret}`");
  });

  it("no PIN reaches a log, an audit entry or an error message", () => {
    for (const f of ["lib/auth/pin-session.ts", "lib/actions/pin.ts", "lib/auth/family-pin.ts"]) {
      const code = read(f);
      const logLines = code.split("\n").filter((l) => /console\.(log|error|warn|info)/.test(l));
      for (const line of logLines) {
        const withoutStrings = line.replace(/"[^"]*"|`[^`]*`/g, "");
        expect(withoutStrings, `${f}: ${line}`).not.toMatch(/(pin|oldPin|newPin|familyPin|expected|password)/);
      }
    }
    const audit = read("lib/actions/pin.ts") + read("lib/auth/pin-session.ts");
    expect(audit).not.toMatch(/after: \{[^}]*\bpin\b[^}]*\}/);
  });

  it("limits fail closed for credentials and match the brief", () => {
    const rl = read("lib/ratelimit/index.ts");
    expect(rl).toContain('slidingWindow(20, "15 m")');
    expect(rl).toContain('fixedWindow(5, "15 m")');
    expect(rl).toContain('slidingWindow(10, "1 h")');
    expect(rl).toMatch(/export async function checkLimitStrict/);
    expect(rl).toMatch(/unavailable: true/);
  });

  it("sessions last about 90 days (rolling)", () => {
    expect(read("lib/supabase/cookie-options.ts")).toContain("60 * 60 * 24 * 90");
    for (const f of ["lib/supabase/server.ts", "lib/supabase/middleware.ts", "lib/supabase/client.ts"]) {
      expect(read(f), f).toContain("authCookieOptions");
    }
  });
});
