import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canSuggestAnother,
  canTransitionSuggestion,
  guardSuggestionInsert,
  resolveSuggestionSchema,
  SUGGESTIONS_PER_DAY,
  suggestRelativeSchema,
} from "@/lib/members/suggestions";

describe("suggestRelativeSchema", () => {
  it("accepts a name and relation; the note is optional", () => {
    const r = suggestRelativeSchema.safeParse({ name: "  Dina Haddad ", relation: "my mother's cousin" });
    expect(r.success && r.data).toEqual({ name: "Dina Haddad", relation: "my mother's cousin", note: null });
  });
  it("keeps a note", () => {
    const r = suggestRelativeSchema.safeParse({ name: "Dina", relation: "aunt", note: " lives in Perth " });
    expect(r.success && r.data.note).toBe("lives in Perth");
  });
  it("rejects missing or too-short fields", () => {
    expect(suggestRelativeSchema.safeParse({ name: "D", relation: "aunt" }).success).toBe(false);
    expect(suggestRelativeSchema.safeParse({ name: "Dina", relation: "" }).success).toBe(false);
    expect(suggestRelativeSchema.safeParse({ relation: "aunt" }).success).toBe(false);
  });
  it("rejects a name with no letters", () => {
    expect(suggestRelativeSchema.safeParse({ name: "12345", relation: "aunt" }).success).toBe(false);
  });
  it("accepts Arabic", () => {
    expect(suggestRelativeSchema.safeParse({ name: "دينا حداد", relation: "ابنة خالتي" }).success).toBe(true);
  });
  it("enforces the length limits that match the database checks", () => {
    expect(suggestRelativeSchema.safeParse({ name: "x".repeat(121), relation: "aunt" }).success).toBe(false);
    expect(suggestRelativeSchema.safeParse({ name: "Dina", relation: "x".repeat(121) }).success).toBe(false);
    expect(suggestRelativeSchema.safeParse({ name: "Dina", relation: "aunt", note: "x".repeat(501) }).success).toBe(false);
    expect(suggestRelativeSchema.safeParse({ name: "Dina", relation: "aunt", note: "x".repeat(500) }).success).toBe(true);
  });
  it("resolve input needs a UUID", () => {
    expect(resolveSuggestionSchema.safeParse({ suggestionId: "nope" }).success).toBe(false);
    expect(resolveSuggestionSchema.safeParse({ suggestionId: "550e8400-e29b-41d4-a716-446655440001" }).success).toBe(true);
  });
});

describe("review state machine (mirrors guard_relative_suggestion)", () => {
  it("an admin can resolve a pending suggestion three ways", () => {
    for (const to of ["added", "already_in_tree", "dismissed"] as const) {
      expect(canTransitionSuggestion("admin", "pending", to)).toBe(true);
    }
  });
  it("resolved suggestions are final", () => {
    for (const from of ["added", "already_in_tree", "dismissed"] as const) {
      expect(canTransitionSuggestion("admin", from, "pending")).toBe(false);
      expect(canTransitionSuggestion("admin", from, "dismissed")).toBe(false);
    }
  });
  it("pending -> pending is not a transition", () => expect(canTransitionSuggestion("admin", "pending", "pending")).toBe(false));
  it("members cannot change a suggestion at all", () => {
    expect(canTransitionSuggestion("owner", "pending", "dismissed")).toBe(false);
  });
});

describe("insert rules and the daily limit", () => {
  const row = { suggested_by: "me", status: "pending" as const, person_id: null, handled_by: null };
  it("allows a pending suggestion for yourself", () => expect(guardSuggestionInsert("me", row, 0).ok).toBe(true));
  it("refuses a suggestion filed as someone else", () => expect(guardSuggestionInsert("me", { ...row, suggested_by: "you" }, 0).ok).toBe(false));
  it("refuses a pre-resolved suggestion", () => {
    expect(guardSuggestionInsert("me", { ...row, status: "added" }, 0).ok).toBe(false);
    expect(guardSuggestionInsert("me", { ...row, person_id: "p" }, 0).ok).toBe(false);
    expect(guardSuggestionInsert("me", { ...row, handled_by: "admin" }, 0).ok).toBe(false);
  });
  it("stops at the daily limit", () => {
    expect(canSuggestAnother(SUGGESTIONS_PER_DAY - 1)).toBe(true);
    expect(canSuggestAnother(SUGGESTIONS_PER_DAY)).toBe(false);
    expect(guardSuggestionInsert("me", row, SUGGESTIONS_PER_DAY).ok).toBe(false);
  });
});

describe("20260522000020_member_journey.sql (RLS reasoning for relative_suggestions)", () => {
  const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260522000020_member_journey.sql"), "utf8");
  const policy = (name: string) => {
    const start = sql.indexOf(`create policy ${name}`);
    expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
    return sql.slice(start, sql.indexOf(";", start));
  };

  it("RLS is on", () => expect(sql).toMatch(/alter table public\.relative_suggestions enable row level security/));
  it("members read only their own suggestions", () => {
    expect(policy("relative_suggestions_select_own")).toMatch(/for select using \(suggested_by = auth\.uid\(\)\)/);
  });
  it("members insert only their own, pending, unreviewed rows", () => {
    const p = policy("relative_suggestions_insert_own");
    expect(p).toMatch(/for insert/);
    expect(p).toMatch(/suggested_by = auth\.uid\(\)/);
    expect(p).toMatch(/status = 'pending'/);
    expect(p).toMatch(/handled_by is null/);
  });
  it("a member still waiting for access can suggest (the insert policy does not require is_approved())", () => {
    expect(policy("relative_suggestions_insert_own")).not.toMatch(/is_approved/);
  });
  it("admins can do everything through is_admin()", () => {
    expect(policy("relative_suggestions_admin_all")).toMatch(/for all using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\)/);
  });
  it("has no member UPDATE or DELETE policy", () => {
    const policies = [...sql.matchAll(/create policy (\w+) on public\.relative_suggestions\s+for (\w+)/g)].map((m) => [m[1], m[2]]);
    expect(policies).toEqual([
      ["relative_suggestions_select_own", "select"],
      ["relative_suggestions_insert_own", "insert"],
      ["relative_suggestions_admin_all", "all"],
    ]);
  });
  it("the guard is SECURITY INVOKER, caps daily inserts, and freezes content", () => {
    const start = sql.indexOf("create or replace function public.guard_relative_suggestion()");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toMatch(/security invoker/i);
    expect(body).toMatch(/>= 10/);
    expect(body).toContain("relative_suggestions content is immutable");
    expect(body).toContain("This suggestion is already %");
  });
  it("the self-service RPCs are pinned to the caller and not callable by anon", () => {
    expect(sql).toMatch(/where id = auth\.uid\(\) and onboarded_at is null/);
    expect(sql).toMatch(/where id = auth\.uid\(\) and checklist_dismissed_at is null/);
    expect(sql).toContain("revoke all on function public.mark_onboarded() from public, anon;");
    expect(sql).toContain("revoke all on function public.dismiss_checklist() from public, anon;");
  });
  it("first_admin_name returns a name only (no email column)", () => {
    const start = sql.indexOf("create or replace function public.first_admin_name()");
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toContain("p.full_name");
    expect(body).not.toMatch(/email/);
  });
});
