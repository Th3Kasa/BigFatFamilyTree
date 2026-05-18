# Milestone 2 — Data Model + Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply all remaining table migrations (people, events, relationships, transcripts, extraction_proposals), add audit-log triggers, build the group-derivation materialized view, generate TypeScript types, and seed Marcelle + immediate family so the DB is fully populated before any UI is built.

**Architecture:** Pure SQL migrations applied via Supabase MCP `apply_migration`. A recursive CTE materialised view (`person_groups`) computes Major/Minor groups from the `father_id` chain; a trigger function refreshes it on every write to `people`. Audit log triggers fire on INSERT/UPDATE/DELETE for `people`, `events`, and `relationships`. TypeScript types are generated from the live schema and committed to `lib/db/types.ts`.

**Tech Stack:** PostgreSQL (Supabase), Supabase MCP (`apply_migration`, `execute_sql`, `generate_typescript_types`), TypeScript, Vitest.

**Prerequisites:**
- Milestone 1 complete: `profiles`, `audit_log`, `settings` tables exist with RLS.
- Supabase MCP connected and authenticated.
- Working directory: repo root.

**Reference spec:** [docs/superpowers/specs/2026-05-18-big-fat-family-tree-design.md](../specs/2026-05-18-big-fat-family-tree-design.md)

---

## File Structure

Files this plan creates (relative to repo root):

```
supabase/
  migrations/
    20260518000004_people.sql
    20260518000005_events.sql
    20260518000006_relationships.sql
    20260518000007_transcripts.sql
    20260518000008_extraction_proposals.sql
    20260518000009_group_derivation.sql
    20260518000010_audit_triggers.sql
  seed.sql                          (overwrite placeholder)
lib/
  db/
    types.ts                        Supabase-generated TypeScript types
tests/
  smoke/
    db-types.test.ts                Asserts generated types compile + export expected shapes
```

---

## Task 1: `people` table

**Files:**
- Create: `supabase/migrations/20260518000004_people.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260518000004_people.sql`:

```sql
-- Enums
do $$ begin
  create type gender_type as enum ('m', 'f', 'unknown');
exception when duplicate_object then null; end $$;

-- People
create table if not exists public.people (
  id                       uuid primary key default gen_random_uuid(),
  given_ar                 text,
  given_en                 text,
  father_name_ar           text,
  father_name_en           text,
  grandfather_name_ar      text,
  grandfather_name_en      text,
  great_grandfather_name_ar text,
  great_grandfather_name_en text,
  family_name_ar           text,
  family_name_en           text,
  gender                   gender_type not null default 'unknown',
  father_id                uuid references public.people(id),
  mother_id                uuid references public.people(id),
  is_placeholder           boolean not null default false,
  photo_url                text,
  notes_ar                 text,
  notes_en                 text,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.people enable row level security;

-- SELECT: any authenticated user
create policy people_select_authenticated on public.people
  for select using (auth.uid() is not null);

-- INSERT/UPDATE/DELETE: admin or editor only
create policy people_write_editor on public.people
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with:
- name: `20260518000004_people`
- query: contents of the file above

- [ ] **Step 3: Verify**

Use `execute_sql` with:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'people'
order by ordinal_position;
```

Expected: 20 columns including `id`, `given_ar`, `given_en`, `father_id`, `mother_id`, `gender`, `deleted_at`, `created_at`, `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000004_people.sql
git commit -m "feat(db): add people table with RLS"
```

---

## Task 2: `events` table

**Files:**
- Create: `supabase/migrations/20260518000005_events.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260518000005_events.sql`:

```sql
do $$ begin
  create type event_type as enum (
    'birth', 'death', 'marriage', 'divorce', 'engagement',
    'migration', 'education', 'notable_story', 'custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type date_precision_type as enum (
    'exact', 'year', 'decade', 'before', 'after', 'around'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_source_type as enum (
    'grandma_transcript', 'family_contribution', 'document', 'admin'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.events (
  id                   uuid primary key default gen_random_uuid(),
  person_id            uuid not null references public.people(id) on delete cascade,
  type                 event_type not null,
  custom_label         text,
  date_value           date,
  date_precision       date_precision_type not null default 'exact',
  location             text,
  story_ar             text,
  story_en             text,
  audio_url            text,
  source_transcript_id uuid references public.transcripts(id),
  source_type          event_source_type not null default 'admin',
  contributed_by       uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.events enable row level security;

create policy events_select_authenticated on public.events
  for select using (auth.uid() is not null);

create policy events_write_editor on public.events
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
```

> Note: `source_transcript_id` references `public.transcripts` which is created in Task 4. If applying migrations in order, this FK can be added in Task 4 as an `ALTER TABLE`. Replace the FK line with just `source_transcript_id uuid` for now and add the constraint in Task 4.

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with:
- name: `20260518000005_events`
- query: contents of the file above (with `source_transcript_id uuid` — no FK yet)

- [ ] **Step 3: Verify**

Use `execute_sql` with:
```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'events'
order by ordinal_position;
```

Expected: 15 columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000005_events.sql
git commit -m "feat(db): add events table with RLS"
```

---

## Task 3: `relationships` table

**Files:**
- Create: `supabase/migrations/20260518000006_relationships.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260518000006_relationships.sql`:

```sql
do $$ begin
  create type relationship_type as enum ('spouse', 'adopted_by', 'raised_by', 'godparent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type relationship_status_type as enum ('current', 'divorced', 'widowed');
exception when duplicate_object then null; end $$;

create table if not exists public.relationships (
  id           uuid primary key default gen_random_uuid(),
  type         relationship_type not null,
  person_a_id  uuid not null references public.people(id) on delete cascade,
  person_b_id  uuid not null references public.people(id) on delete cascade,
  start_date   date,
  end_date     date,
  status       relationship_status_type not null default 'current',
  order_index  int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint relationships_different_people check (person_a_id != person_b_id)
);

alter table public.relationships enable row level security;

create policy relationships_select_authenticated on public.relationships
  for select using (auth.uid() is not null);

create policy relationships_write_editor on public.relationships
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

create trigger relationships_set_updated_at
  before update on public.relationships
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with:
- name: `20260518000006_relationships`
- query: contents of the file above

- [ ] **Step 3: Verify**

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'relationships'
order by ordinal_position;
```

Expected: 10 columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000006_relationships.sql
git commit -m "feat(db): add relationships table with RLS"
```

---

## Task 4: `transcripts` table

**Files:**
- Create: `supabase/migrations/20260518000007_transcripts.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260518000007_transcripts.sql`:

```sql
create table if not exists public.transcripts (
  id             uuid primary key default gen_random_uuid(),
  audio_url      text not null,
  raw_text_ar    text,
  segments       jsonb,
  recorded_at    date,
  recorded_with  uuid references public.people(id),
  uploaded_by    uuid not null references public.profiles(id),
  created_at     timestamptz not null default now()
);

alter table public.transcripts enable row level security;

create policy transcripts_select_authenticated on public.transcripts
  for select using (auth.uid() is not null);

create policy transcripts_write_editor on public.transcripts
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- Now that transcripts exists, add the FK on events
alter table public.events
  add constraint events_source_transcript_id_fkey
  foreign key (source_transcript_id) references public.transcripts(id);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with:
- name: `20260518000007_transcripts`
- query: contents of the file above

- [ ] **Step 3: Verify**

```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Expected: `audit_log`, `events`, `people`, `profiles`, `relationships`, `settings`, `transcripts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000007_transcripts.sql
git commit -m "feat(db): add transcripts table with RLS"
```

---

## Task 5: `extraction_proposals` table

**Files:**
- Create: `supabase/migrations/20260518000008_extraction_proposals.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260518000008_extraction_proposals.sql`:

```sql
do $$ begin
  create type proposal_status_type as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.extraction_proposals (
  id                uuid primary key default gen_random_uuid(),
  transcript_id     uuid not null references public.transcripts(id) on delete cascade,
  proposed_changes  jsonb not null default '[]',
  confidence_notes  jsonb not null default '[]',
  status            proposal_status_type not null default 'pending',
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.extraction_proposals enable row level security;

-- Any authenticated user can SELECT (to view inbox)
create policy proposals_select_authenticated on public.extraction_proposals
  for select using (auth.uid() is not null);

-- Only admin + editor can INSERT (system inserts via Edge Function using service key; humans don't insert directly)
-- Only admin + editor can UPDATE status (approve/reject)
create policy proposals_write_editor on public.extraction_proposals
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with:
- name: `20260518000008_extraction_proposals`
- query: contents of the file above

- [ ] **Step 3: Verify**

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'extraction_proposals'
order by ordinal_position;
```

Expected: `id`, `transcript_id`, `proposed_changes`, `confidence_notes`, `status`, `reviewed_by`, `reviewed_at`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000008_extraction_proposals.sql
git commit -m "feat(db): add extraction_proposals table with RLS"
```

---

## Task 6: Group derivation materialized view

**Files:**
- Create: `supabase/migrations/20260518000009_group_derivation.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260518000009_group_derivation.sql`:

```sql
-- Materialized view: for each person, walk father_id chain to the patrilineal root.
-- Major group = root's family_name_ar.
-- Minor group = person's own family_name_ar when it differs from their direct father's.
create materialized view public.person_groups as
with recursive patriline as (
  -- Anchor: people whose father is not in the DB (root of known tree)
  select
    id,
    family_name_ar  as major_group_ar,
    family_name_en  as major_group_en,
    father_id,
    0               as depth
  from public.people
  where (father_id is null
         or father_id not in (select id from public.people where deleted_at is null))
    and deleted_at is null

  union all

  -- Walk down: children inherit the major group
  select
    p.id,
    pl.major_group_ar,
    pl.major_group_en,
    p.father_id,
    pl.depth + 1
  from public.people p
  join patriline pl on p.father_id = pl.id
  where p.deleted_at is null
    and pl.depth < 30  -- safety valve against cycles
)
select
  p.id,
  coalesce(pl.major_group_ar, p.family_name_ar)  as major_group_ar,
  coalesce(pl.major_group_en, p.family_name_en)  as major_group_en,
  -- Minor group: person whose family_name_ar differs from their father's
  case
    when fp.id is not null and p.family_name_ar is not null
         and p.family_name_ar != coalesce(fp.family_name_ar, '')
    then p.family_name_ar
    else null
  end                                             as minor_group_ar,
  case
    when fp.id is not null and p.family_name_en is not null
         and p.family_name_en != coalesce(fp.family_name_en, '')
    then p.family_name_en
    else null
  end                                             as minor_group_en
from public.people p
left join patriline pl on p.id = pl.id
left join public.people fp on p.father_id = fp.id
where p.deleted_at is null;

-- Unique index required for REFRESH CONCURRENTLY (used in trigger)
create unique index person_groups_id_idx on public.person_groups (id);

-- Function to refresh the view; called by trigger
create or replace function public.refresh_person_groups()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.person_groups;
  return null;
end; $$;

-- Trigger: refresh after any change to people
create trigger people_refresh_groups
  after insert or update or delete on public.people
  for each statement execute function public.refresh_person_groups();
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with:
- name: `20260518000009_group_derivation`
- query: contents of the file above

- [ ] **Step 3: Verify**

```sql
select * from public.person_groups limit 5;
```

Expected: empty result (no people yet) with columns `id`, `major_group_ar`, `major_group_en`, `minor_group_ar`, `minor_group_en`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000009_group_derivation.sql
git commit -m "feat(db): group derivation materialized view + refresh trigger"
```

---

## Task 7: Audit log triggers for people, events, relationships

**Files:**
- Create: `supabase/migrations/20260518000010_audit_triggers.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260518000010_audit_triggers.sql`:

```sql
-- Generic audit trigger function; reused for all tables.
create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, table_name, row_id, operation, before, after)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end; $$;

-- people
create trigger people_audit
  after insert or update or delete on public.people
  for each row execute function public.log_audit();

-- events
create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.log_audit();

-- relationships
create trigger relationships_audit
  after insert or update or delete on public.relationships
  for each row execute function public.log_audit();
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `apply_migration` with:
- name: `20260518000010_audit_triggers`
- query: contents of the file above

- [ ] **Step 3: Verify**

```sql
select trigger_name, event_manipulation, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;
```

Expected triggers: `people_audit`, `people_refresh_groups`, `people_set_updated_at`, `events_audit`, `events_set_updated_at`, `relationships_audit`, `relationships_set_updated_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000010_audit_triggers.sql
git commit -m "feat(db): audit log triggers for people, events, relationships"
```

---

## Task 8: Generate TypeScript types

**Files:**
- Create: `lib/db/types.ts`
- Create: `tests/smoke/db-types.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/smoke/db-types.test.ts`:

```ts
import { describe, it, expectTypeOf } from "vitest";
import type { Database } from "@/lib/db/types";

describe("Database types", () => {
  it("exports a Database type with public schema", () => {
    type Tables = Database["public"]["Tables"];
    type PeopleRow = Tables["people"]["Row"];
    type EventsRow = Tables["events"]["Row"];
    type RelationshipsRow = Tables["relationships"]["Row"];

    expectTypeOf<PeopleRow["id"]>().toBeString();
    expectTypeOf<PeopleRow["gender"]>().toEqualTypeOf<"m" | "f" | "unknown">();
    expectTypeOf<EventsRow["type"]>().toEqualTypeOf<
      "birth" | "death" | "marriage" | "divorce" | "engagement" |
      "migration" | "education" | "notable_story" | "custom"
    >();
    expectTypeOf<RelationshipsRow["type"]>().toEqualTypeOf<
      "spouse" | "adopted_by" | "raised_by" | "godparent"
    >();
  });
});
```

- [ ] **Step 2: Run test — expect compile failure**

```bash
npx vitest run tests/smoke/db-types.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/db/types'`.

- [ ] **Step 3: Generate types via Supabase MCP**

Use `generate_typescript_types` MCP tool. Copy the output into `lib/db/types.ts`.

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run tests/smoke/db-types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/types.ts tests/smoke/db-types.test.ts
git commit -m "feat: generate TypeScript DB types from Supabase schema"
```

---

## Task 9: Seed Marcelle + immediate family

**Files:**
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Overwrite seed.sql**

Replace the placeholder `supabase/seed.sql` with:

```sql
-- Seed: Marcelle + immediate family
-- Run once in the Supabase SQL editor (or via MCP execute_sql) after first deploy.
-- Safe to re-run: uses ON CONFLICT DO NOTHING.

-- ── Marcelle (focal person / grandma) ──────────────────────────────────────
insert into public.people (
  id, given_ar, given_en,
  father_name_ar, father_name_en,
  grandfather_name_ar, grandfather_name_en,
  family_name_ar, family_name_en,
  gender, is_placeholder
) values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'مارسيل',          'Marcelle',
  'جبالة',           'Gaballah',
  'شحاتة',           'Shahata',
  'الزواتي',         'El Zawaty',
  'f', false
) on conflict (id) do nothing;

-- ── Husband (placeholder — fill in real name) ──────────────────────────────
insert into public.people (
  id, given_ar, given_en,
  family_name_ar, family_name_en,
  gender, is_placeholder
) values (
  'aaaaaaaa-0000-0000-0000-000000000002',
  null,  null,
  null,  null,
  'm', true
) on conflict (id) do nothing;

-- Spouse relationship: Marcelle ↔ Husband
insert into public.relationships (person_a_id, person_b_id, type, status, order_index)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'spouse', 'current', 1
) on conflict do nothing;

-- ── Marcelle's birth event ──────────────────────────────────────────────────
insert into public.events (person_id, type, date_precision, source_type)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'birth', 'year', 'admin'
) on conflict do nothing;

-- ── Update settings: Marcelle is the focal person ──────────────────────────
update public.settings
set focal_person_id = 'aaaaaaaa-0000-0000-0000-000000000001'
where id = 1;
```

> **Note to engineer:** Replace placeholder husband with real data (given_ar, given_en, family_name_ar, family_name_en, is_placeholder = false) and add children the same way once names are known. Each child needs `father_id = 'aaaaaaaa-0000-0000-0000-000000000002'` and `mother_id = 'aaaaaaaa-0000-0000-0000-000000000001'`.

- [ ] **Step 2: Apply seed via Supabase MCP**

Use `execute_sql` with the full contents of `supabase/seed.sql`.

- [ ] **Step 3: Verify**

```sql
select id, given_en, family_name_en, gender, is_placeholder from public.people;
```

Expected: 2 rows — Marcelle and the husband placeholder.

```sql
select focal_person_id from public.settings where id = 1;
```

Expected: `aaaaaaaa-0000-0000-0000-000000000001`.

```sql
select id, major_group_ar, minor_group_ar from public.person_groups;
```

Expected: 1 row for Marcelle with `major_group_ar = 'الزواتي'` (the placeholder husband has no family_name_ar so may be null).

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed Marcelle + husband placeholder, set focal person"
```

---

## Task 10: Run full test suite + push

- [ ] **Step 1: Run all tests**

```bash
npm run typecheck
npm run test
```

Expected: all pass.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

Expected: Vercel build succeeds (no code changes — only SQL and types).

---

## Acceptance criteria (Milestone 2 complete when all true)

- `people`, `events`, `relationships`, `transcripts`, `extraction_proposals` tables exist in Supabase with RLS enabled and correct policies.
- `person_groups` materialized view exists; inserting a people row refreshes it.
- Audit log triggers fire on `people`, `events`, `relationships` — verified by inserting a row and checking `audit_log`.
- `lib/db/types.ts` committed; `db-types.test.ts` passes (`npm run test`).
- Marcelle row exists in `people`; `settings.focal_person_id` points to her.
- `npm run typecheck`, `npm run test` both pass.
