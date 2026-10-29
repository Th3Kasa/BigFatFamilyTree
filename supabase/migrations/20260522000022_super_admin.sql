-- Super admin: the owner's account.
--
--  * profiles.is_super_admin marks it. Only a backend role (service key,
--    migrations, the SQL editor) can set or clear the flag.
--  * public.is_super_admin() tells policies and server code who the caller is.
--  * is_admin() is true for a super admin too (a super admin is always an admin).
--  * The profiles guard now also enforces:
--      - creating or removing an admin (role to or from 'admin') needs a super admin;
--      - deleting an account (profiles row) needs a super admin or a backend role;
--      - a super admin cannot be demoted or deleted except by a backend role;
--      - there can never be zero super admins.
--
-- Mirrored in lib/members/permissions.ts (unit-tested).

-- ── column + constraint ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

comment on column public.profiles.is_super_admin is 'The owner. Can add and remove members and admins. Only a backend role can change it.';

alter table public.profiles drop constraint if exists profiles_super_admin_is_admin;
alter table public.profiles
  add constraint profiles_super_admin_is_admin check (not is_super_admin or role = 'admin');

-- ── helpers ─────────────────────────────────────────────────────────────────
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_super_admin
  );
$$;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- A super admin is an admin. (Replaces 20260521000015.)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.is_super_admin)
  );
$$;

-- Same story as is_admin()/is_backend_role() in 20260522000021: the invoker guard
-- trigger evaluates this as whichever role deletes the auth user.
do $$
declare r text;
begin
  foreach r in array array['supabase_auth_admin', 'supabase_admin'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.is_super_admin() to %I', r);
    end if;
  end loop;
end $$;

-- ── guard trigger ───────────────────────────────────────────────────────────
-- Replaces 20260522000020; the super-admin rules are new.
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_backend    boolean := public.is_backend_role();
  v_super      boolean := public.is_super_admin();
  v_privileged boolean := v_backend or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if new.is_super_admin and not v_backend then
      raise exception 'Only the backend can create a super admin' using errcode = '42501';
    end if;
    if new.role = 'admin' and not (v_backend or v_super) then
      raise exception 'Only a super admin can create an admin' using errcode = '42501', hint = 'super_admin_required';
    end if;
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

    -- The flag itself, and demoting a super admin: backend only.
    if new.is_super_admin is distinct from old.is_super_admin and not v_backend then
      raise exception 'Only the backend can change is_super_admin' using errcode = '42501';
    end if;
    if old.is_super_admin and new.role is distinct from old.role and not v_backend then
      raise exception 'A super admin cannot be demoted' using errcode = '42501', hint = 'super_admin_protected';
    end if;
    -- Creating or removing an admin: super admin (or backend) only.
    if new.role is distinct from old.role
       and (new.role = 'admin' or old.role = 'admin')
       and not (v_backend or v_super) then
      raise exception 'Only a super admin can create or remove admins' using errcode = '42501', hint = 'super_admin_required';
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

  if tg_op = 'DELETE' then
    -- Deleting an account is for the owner. (Deleting the auth user runs this as
    -- a backend role, so the cascade is allowed.)
    if not (v_backend or v_super) then
      raise exception 'Only a super admin can delete accounts' using errcode = '42501', hint = 'super_admin_required';
    end if;
    if old.is_super_admin and not v_backend then
      raise exception 'A super admin cannot be deleted' using errcode = '42501', hint = 'super_admin_protected';
    end if;
  end if;

  -- There is always at least one super admin, whoever asks.
  if old.is_super_admin and (tg_op = 'DELETE' or new.is_super_admin is not true) then
    perform pg_advisory_xact_lock(hashtext('profiles_last_super_admin'));
    if not exists (
      select 1 from public.profiles p where p.is_super_admin and p.id <> old.id
    ) then
      raise exception 'Cannot remove the last super admin'
        using errcode = 'P0001', hint = 'last_super_admin';
    end if;
  end if;

  -- There is always at least one admin (unchanged).
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

-- ── the owner ───────────────────────────────────────────────────────────────
-- Runs as the migration role (a backend role), so the guard allows it.
update public.profiles p
set is_super_admin = true,
    role = 'admin',
    approved_at = coalesce(p.approved_at, now())
from auth.users u
where u.id = p.id
  and lower(u.email) = 'basemmorkos98@gmail.com';

-- ── deleting an account must not be blocked by "who did this" columns ───────
-- Stories, transcripts and invitations a member contributed stay; they just lose
-- the attribution. (Without this, deleting anyone who ever added a story fails.)
alter table public.transcripts alter column uploaded_by drop not null;

do $$
declare
  spec record;
  con  record;
begin
  for spec in
    select * from (values
      ('profiles',              'invited_by'),
      ('events',                'contributed_by'),
      ('transcripts',           'uploaded_by'),
      ('extraction_proposals',  'reviewed_by')
    ) as s(tbl, col)
  loop
    -- drop whatever the foreign key to profiles is called in this database
    for con in
      select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f'
        and c.conrelid = format('public.%I', spec.tbl)::regclass
        and c.confrelid = 'public.profiles'::regclass
        and a.attname = spec.col
    loop
      execute format('alter table public.%I drop constraint %I', spec.tbl, con.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      spec.tbl, spec.tbl || '_' || spec.col || '_fkey', spec.col);
  end loop;
end $$;
