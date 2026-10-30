import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eventSchema, MAX_MEMORY_PHOTOS, MEMORY_PHOTO_RE } from "@/lib/validation/events";

// Memories with photos for every approved member (migration 31). The rules were
// run against a real Postgres (PGlite) together with migration 30 (21 cases:
// viewers writing anywhere, own-only edits and deletes, author can't change,
// own uploads only, path tricks, the 6-photo cap, storage folders); these guard
// the properties that are easy to break in a later edit.

const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260601000031_memory_photos.sql"), "utf8");
const USER = "10000000-0000-4000-8000-000000000002";

describe("20260601000031_memory_photos.sql", () => {
  it("adds photo_paths with a check that matches the app's rule", () => {
    expect(sql).toMatch(/add column if not exists photo_paths text\[\] not null default '\{\}'/);
    expect(sql).toMatch(/coalesce\(cardinality\(p\), 0\) <= 6/);
    expect(sql).toContain("^memories/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\\.(jpg|jpeg|png|webp|gif)$");
    expect(sql).toMatch(/add constraint events_photo_paths_valid check \(public\.valid_memory_photo_paths\(photo_paths\)\)/);
  });

  it("any approved member writes memories as themselves; only their own can be edited or deleted", () => {
    expect(sql).toContain("drop policy if exists events_write_memory_editor on public.events;");
    expect(sql).toMatch(/create policy events_memory_insert_member on public\.events\s+for insert with check \(\s+type = 'notable_story'\s+and \(select public\.is_approved\(\)\)\s+and contributed_by = auth\.uid\(\)/);
    expect(sql).toMatch(/create policy events_memory_update_own[\s\S]*?using \(type = 'notable_story' and contributed_by = auth\.uid\(\)[\s\S]*?with check \(type = 'notable_story' and contributed_by = auth\.uid\(\)/);
    expect(sql).toMatch(/create policy events_memory_delete_own[\s\S]*?using \(type = 'notable_story' and contributed_by = auth\.uid\(\)/);
  });

  it("the guard fixes the author on insert, never lets it change, and allows only the author's own uploads", () => {
    const body = sql.slice(sql.indexOf("create or replace function public.guard_events_author()"), sql.indexOf("create trigger events_guard_author"));
    expect(body).toMatch(/if public\.is_backend_role\(\) or public\.is_admin\(\) then\s+return new;/);
    expect(body).toMatch(/new\.contributed_by := auth\.uid\(\)/);
    expect(body).toMatch(/new\.contributed_by is distinct from old\.contributed_by/);
    expect(body).toMatch(/'memories\/' \|\| coalesce\(auth\.uid\(\)::text, ''\) \|\| '\/'/);
    expect(sql).toMatch(/create trigger events_guard_author\s+before insert or update on public\.events/);
  });

  it("storage: members upload and delete only in photos/memories/<their own id>/", () => {
    for (const name of ["photos_member_memory_insert", "photos_member_memory_delete"]) {
      const start = sql.indexOf(`create policy "${name}"`);
      expect(start).toBeGreaterThan(0);
      const body = sql.slice(start, sql.indexOf(");", start));
      expect(body).toContain("bucket_id = 'photos'");
      expect(body).toContain("(select public.is_approved())");
      expect(body).toContain("(storage.foldername(name))[1] = 'memories'");
      expect(body).toContain("(storage.foldername(name))[2] = (select auth.uid())::text");
    }
  });
});

describe("memory photo validation", () => {
  const base = { type: "notable_story", date_precision: "around", story_en: "hi" };

  it("accepts up to six of the author's memory photos, defaulting to none", () => {
    expect(eventSchema.parse(base).photo_paths).toEqual([]);
    const six = Array.from({ length: MAX_MEMORY_PHOTOS }, (_, i) => `memories/${USER}/p${i}.jpg`);
    expect(eventSchema.safeParse({ ...base, photo_paths: six }).success).toBe(true);
  });

  it("refuses a seventh photo, other folders and path tricks", () => {
    const seven = Array.from({ length: 7 }, (_, i) => `memories/${USER}/p${i}.jpg`);
    expect(eventSchema.safeParse({ ...base, photo_paths: seven }).success).toBe(false);
    for (const bad of [`${USER}/a.jpg`, `memories/${USER}/../x.jpg`, `memories/${USER}/a.exe`, "https://evil.example/a.jpg", `memories/not-a-user/a.jpg`]) {
      expect(MEMORY_PHOTO_RE.test(bad), bad).toBe(false);
    }
    expect(eventSchema.safeParse({ ...base, photo_paths: "nope" }).success).toBe(false);
  });
});
