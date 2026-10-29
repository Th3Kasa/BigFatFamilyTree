-- Member journey: relatives who are not on the site yet, first-visit tour,
-- profile checklist.
--
--  1. profiles.onboarded_at       set once, when an approved member lands on the tour
--     profiles.checklist_dismissed_at  set when they close the "finish your profile" card
--     Neither can be written by a member directly (no self-update policy and the
--     guard below refuses it); they go through mark_onboarded() / dismiss_checklist().
--  2. relative_suggestions: "Suggest a relative" (any signed-in account, including
--     one still waiting for access). Same RLS + guard style as link_requests.
--  3. first_admin_name(): a display name only, so a declined member can be told
--     who to ask. Never an email address.

-- ── 1. profile columns + the two self-service RPCs ─────────────────────────
alter table public.profiles
  add column if not exists onboarded_at timestamptz,
  add column if not exists checklist_dismissed_at timestamptz;

comment on column public.profiles.onboarded_at is 'First time this member landed on the tour after being approved. null = not yet.';
comment on column public.profiles.checklist_dismissed_at is 'When the member dismissed the profile-completion checklist.';

-- Runs as the function owner, which the profiles guard treats as a backend role,
-- but is hard-wired to the caller's own row and only ever sets a null column.
create or replace function public.mark_onboarded()
returns void
language sql security definer set search_path = public as $$
  update public.profiles
  set onboarded_at = now()
  where id = auth.uid() and onboarded_at is null;
$$;
revoke all on function public.mark_onboarded() from public, anon;
grant execute on function public.mark_onboarded() to authenticated;

create or replace function public.dismiss_checklist()
returns void
language sql security definer set search_path = public as $$
  update public.profiles
  set checklist_dismissed_at = now()
  where id = auth.uid() and checklist_dismissed_at is null;
$$;
revoke all on function public.dismiss_checklist() from public, anon;
grant execute on function public.dismiss_checklist() to authenticated;

-- Guard: the new columns are admin/backend-only for direct writes. (Replaces
-- 20260522000019; only the two extra columns are new.)
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_privileged boolean := public.is_backend_role() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_privileged and (
         new.role is distinct from 'viewer'
      or new.person_id is not null
      or new.approved_at is not null
      or new.approved_by is not null
      or new.onboarded_at is not null
      or new.checklist_dismissed_at is not null
    ) then
      raise exception 'Only an admin can set role, person_id or approval' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'profiles.id is immutable' using errcode = '42501';
    end if;
    if not v_privileged and (
         new.role is distinct from old.role
      or new.person_id is distinct from old.person_id
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
      or new.onboarded_at is distinct from old.onboarded_at
      or new.checklist_dismissed_at is distinct from old.checklist_dismissed_at
    ) then
      raise exception 'Only an admin can change role, person_id or approval' using errcode = '42501';
    end if;

    if new.role = 'admin' and old.approved_at is not null and new.approved_at is null then
      raise exception 'Admins always have access' using errcode = 'P0001', hint = 'admin_access';
    end if;

    if new.approved_at is null then
      new.approved_by := null;
    elsif old.approved_at is null and new.approved_by is null then
      new.approved_by := auth.uid();
    end if;
  end if;

  if old.role = 'admin' and (tg_op = 'DELETE' or new.role is distinct from 'admin') then
    perform pg_advisory_xact_lock(hashtext('profiles_last_admin'));
    if not exists (
      select 1 from public.profiles p where p.role = 'admin' and p.id <> old.id
    ) then
      raise exception 'Cannot remove the last admin'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end; $$;

-- ── 2. relative_suggestions ─────────────────────────────────────────────────
do $$ begin
  create type relative_suggestion_status as enum ('pending', 'added', 'already_in_tree', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.relative_suggestions (
  id           uuid primary key default gen_random_uuid(),
  suggested_by uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 120),
  relation     text not null check (char_length(btrim(relation)) between 2 and 120),
  note         text check (note is null or char_length(note) <= 500),
  status       relative_suggestion_status not null default 'pending',
  -- who they turned out to be, once an admin adds or finds them in the tree
  person_id    uuid references public.people(id) on delete set null,
  created_at   timestamptz not null default now(),
  handled_by   uuid references public.profiles(id) on delete set null,
  handled_at   timestamptz
);

create index if not exists relative_suggestions_status_created_idx
  on public.relative_suggestions (status, created_at);
create index if not exists relative_suggestions_by_idx
  on public.relative_suggestions (suggested_by, created_at);

-- State machine + column guard (mirrored in lib/members/suggestions.ts, unit-tested).
-- SECURITY INVOKER like the other guards, so is_backend_role() sees the caller.
create or replace function public.guard_relative_suggestion()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_admin boolean := public.is_backend_role() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_admin then
      if new.suggested_by is distinct from auth.uid() then
        raise exception 'You can only suggest relatives for your own account' using errcode = '42501';
      end if;
      if new.status <> 'pending' or new.person_id is not null
         or new.handled_by is not null or new.handled_at is not null then
        raise exception 'New suggestions must be pending' using errcode = '42501';
      end if;
      -- Backstop for the rate limit in the server action: direct API calls
      -- cannot flood the admins either.
      if (select count(*) from public.relative_suggestions s
          where s.suggested_by = new.suggested_by
            and s.created_at > now() - interval '1 day') >= 10 then
        raise exception 'Too many suggestions today. Please try again tomorrow.'
          using errcode = 'P0001', hint = 'suggestion_limit';
      end if;
    end if;
    new.name := btrim(new.name);
    new.relation := btrim(new.relation);
    return new;
  end if;

  -- UPDATE: only an admin (or the backend) may change anything, and only the
  -- review fields of a pending suggestion.
  if not v_admin then
    raise exception 'Only an admin can review suggestions' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.suggested_by is distinct from old.suggested_by
     or new.name is distinct from old.name
     or new.relation is distinct from old.relation
     or new.note is distinct from old.note
     or new.created_at is distinct from old.created_at then
    raise exception 'relative_suggestions content is immutable' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'This suggestion is already %', old.status using errcode = 'P0001';
  end if;
  if new.status <> 'pending' then
    new.handled_by := coalesce(auth.uid(), new.handled_by);
    new.handled_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists relative_suggestions_guard on public.relative_suggestions;
create trigger relative_suggestions_guard
  before insert or update on public.relative_suggestions
  for each row execute function public.guard_relative_suggestion();

drop trigger if exists relative_suggestions_audit on public.relative_suggestions;
create trigger relative_suggestions_audit
  after insert or update or delete on public.relative_suggestions
  for each row execute function public.log_audit();

alter table public.relative_suggestions enable row level security;

-- Members: read their own suggestions (so the pending screen can list them).
create policy relative_suggestions_select_own on public.relative_suggestions
  for select using (suggested_by = auth.uid());

-- Members: add a suggestion for themselves. Deliberately NOT gated on
-- is_approved(): a member still waiting for access can invite family.
create policy relative_suggestions_insert_own on public.relative_suggestions
  for insert with check (
    suggested_by = auth.uid()
    and status = 'pending'
    and person_id is null
    and handled_by is null
    and handled_at is null
  );

-- No member UPDATE or DELETE policy: a suggestion cannot be edited or recalled.

-- Admins: read and review everything.
create policy relative_suggestions_admin_all on public.relative_suggestions
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 3. who to ask ───────────────────────────────────────────────────────────
-- The oldest admin's full name (null if none set). Name only, never an email.
create or replace function public.first_admin_name()
returns text
language sql stable security definer set search_path = public as $$
  select nullif(btrim(p.full_name), '')
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at, p.id
  limit 1;
$$;
revoke all on function public.first_admin_name() from public, anon;
grant execute on function public.first_admin_name() to authenticated;
