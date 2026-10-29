-- PIN-based family sign-in.
--
-- Family members do not use email. They join with first name, last name, date
-- of birth and a 4-digit PIN (after proving they are family with the shared
-- 6-digit family PIN) and sign in with the same four things.
--
--  * profiles gains first_name, last_name, login_method ('email' | 'pin'),
--    name_key (normalised lower-case first + last, Arabic-aware) and
--    pin_must_change (an admin reset the PIN: ask for a new one after sign-in).
--  * one PIN account per (name_key, date_of_birth).
--  * handle_new_user() builds a PIN profile ONLY when the account was created
--    server-side with raw_app_meta_data.login = 'pin' (app metadata cannot be
--    set by a browser calling signUp, so nobody can squat a name that way).
--    The server also passes the normalised name_key there (one JS implementation,
--    lib/auth/pin-validation.ts, is the single source of truth); _claim_norm is
--    the fallback.
--  * the profiles guard also protects the new identity columns.
--  * family_settings: admin-readable key/value table holding the family PIN.
--    Only the super admin may change it; the server reads it with the service
--    role. It is a shared invite code, not a credential.
--
-- The PIN itself is never stored: the auth password is
-- HMAC-SHA256(key, userId ":" pin), see lib/auth/pin-crypto.ts.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists login_method text not null default 'email',
  add column if not exists name_key text,
  add column if not exists pin_must_change boolean not null default false;

alter table public.profiles drop constraint if exists profiles_login_method_check;
alter table public.profiles
  add constraint profiles_login_method_check check (login_method in ('email', 'pin'));

alter table public.profiles drop constraint if exists profiles_pin_identity_check;
alter table public.profiles
  add constraint profiles_pin_identity_check
  check (login_method <> 'pin' or (name_key is not null and date_of_birth is not null));

comment on column public.profiles.login_method is 'email = Supabase email sign-in (admins, invites); pin = name + birthday + 4-digit PIN';
comment on column public.profiles.name_key is 'Normalised lower-case first + last name; with date_of_birth it identifies a PIN account';
comment on column public.profiles.pin_must_change is 'An admin reset this PIN; the member is asked to choose a new one';

-- The duplicate-account rule: one PIN account per name + birthday.
create unique index if not exists profiles_pin_identity_uidx
  on public.profiles (name_key, date_of_birth)
  where login_method = 'pin';

-- ── handle_new_user: PIN accounts ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pin        boolean := coalesce(new.raw_app_meta_data->>'login', '') = 'pin';
  v_first      text := left(nullif(btrim(new.raw_user_meta_data->>'first_name'), ''), 60);
  v_last       text := left(nullif(btrim(new.raw_user_meta_data->>'last_name'), ''), 60);
  v_full_name  text := left(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), 120);
  v_dob        date;
begin
  begin
    v_dob := nullif(btrim(new.raw_user_meta_data->>'date_of_birth'), '')::date;
  exception when others then
    v_dob := null;
  end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then
    v_dob := null;
  end if;

  if v_pin then
    -- Strict: a PIN account without a name and birthday is refused outright
    -- (the server validates first, so this is the last line of defence).
    if v_first is null or v_last is null or v_dob is null then
      raise exception 'A PIN account needs first name, last name and date of birth' using errcode = '22023';
    end if;
    v_full_name := left(v_first || ' ' || v_last, 120);
    insert into public.profiles
      (id, display_name, full_name, first_name, last_name, date_of_birth, email, role, login_method, name_key)
    values
      (new.id, v_full_name, v_full_name, v_first, v_last, v_dob, null, 'viewer', 'pin',
       coalesce(nullif(btrim(new.raw_app_meta_data->>'name_key'), ''), public._claim_norm(v_first || ' ' || v_last)))
    on conflict (id) do nothing;
    return new;
  end if;

  insert into public.profiles (id, display_name, full_name, date_of_birth, email, role)
  values (
    new.id,
    coalesce(v_full_name, new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_full_name,
    v_dob,
    new.email,
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- ── guard: protect the identity columns ─────────────────────────────────────
-- Replaces 20260522000024; the PIN identity rules are new.
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
    -- PIN identity columns are written only by the sign-up trigger / service role.
    if not v_backend and (new.login_method is distinct from 'email' or new.name_key is not null or new.pin_must_change) then
      raise exception 'Only the backend can set login_method, name_key or pin_must_change' using errcode = '42501';
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

    -- PIN sign-in identity. Nobody but a backend role (service key, migrations)
    -- may change how an account signs in, its lookup key, the must-change flag,
    -- or the name and birthday of a PIN account (they ARE the username).
    if not v_backend and (
         new.login_method is distinct from old.login_method
      or new.name_key is distinct from old.name_key
      or new.pin_must_change is distinct from old.pin_must_change
      or (old.login_method = 'pin' and (
            new.date_of_birth is distinct from old.date_of_birth
         or new.first_name is distinct from old.first_name
         or new.last_name is distinct from old.last_name))
    ) then
      raise exception 'Only the backend can change login_method, name_key, pin_must_change or a PIN account''s name and birthday'
        using errcode = '42501', hint = 'pin_identity_protected';
    end if;

    -- The flag itself, and demoting a super admin: backend only.
    if new.is_super_admin is distinct from old.is_super_admin and not v_backend then
      raise exception 'Only the backend can change is_super_admin' using errcode = '42501';
    end if;
    if old.is_super_admin and new.role is distinct from old.role and not v_backend then
      raise exception 'A super admin cannot be demoted' using errcode = '42501', hint = 'super_admin_protected';
    end if;
    -- The owner's own details (link to the tree, name, birthday, email) can be
    -- changed by the owner or a backend role, not by another admin.
    if old.is_super_admin and not v_backend and auth.uid() is distinct from old.id and (
         new.person_id is distinct from old.person_id
      or new.display_name is distinct from old.display_name
      or new.full_name is distinct from old.full_name
      or new.date_of_birth is distinct from old.date_of_birth
      or new.email is distinct from old.email
    ) then
      raise exception 'Only the super admin can change their own profile' using errcode = '42501', hint = 'super_admin_protected';
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
-- ── family_settings: the shared family PIN ──────────────────────────────────
create table if not exists public.family_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.family_settings enable row level security;
revoke all on public.family_settings from public, anon;
grant select, insert, update on public.family_settings to authenticated;

drop policy if exists family_settings_select_admin on public.family_settings;
create policy family_settings_select_admin on public.family_settings
  for select using ((select public.is_admin()));

drop policy if exists family_settings_insert_super on public.family_settings;
create policy family_settings_insert_super on public.family_settings
  for insert with check ((select public.is_super_admin()));

drop policy if exists family_settings_update_super on public.family_settings;
create policy family_settings_update_super on public.family_settings
  for update using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- No delete policy: the family PIN is replaced, never removed.
