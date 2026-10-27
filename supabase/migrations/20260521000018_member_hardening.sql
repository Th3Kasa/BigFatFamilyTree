-- Member accounts, part 4: hardening from the security review.
--
--  1. Who counts as "the backend" in the guard triggers is now decided by the
--     database role, not by auth.uid() being null.
--  2. The last-admin rule also covers DELETE and is serialised with an advisory
--     lock, so two admins demoting each other at once cannot both succeed.
--  3. audit_log.actor_id no longer blocks deleting an account.
--  4. Profile audit rows no longer copy email / date_of_birth.
--  5. Date of birth floor is 1900-01-01, matching the sign-up form.

-- ── 1. backend-role check ───────────────────────────────────────────────────
--
-- SECURITY INVOKER on purpose: current_user must be the caller's role
-- (anon / authenticated / service_role via PostgREST; postgres for migrations
-- and the SQL editor; postgres or supabase_admin when reached from the
-- SECURITY DEFINER handle_new_user() sign-up trigger; supabase_auth_admin for
-- GoTrue itself). Inside a SECURITY DEFINER function current_user would always
-- be the owner, so the guard triggers below are SECURITY INVOKER too.
--
-- Callers cannot become any of these roles: PostgREST only switches to the
-- role named in a JWT signed with the project secret, and auth.role() reads
-- that same verified claim.
create or replace function public.is_backend_role()
returns boolean
language sql stable security invoker set search_path = public as $$
  select coalesce(auth.role() = 'service_role', false)
      or current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin');
$$;
-- Execute stays granted to authenticated: the invoker triggers call it as the
-- signed-in user. It only reports on the caller's own role.

-- ── profiles policies: match production ─────────────────────────────────────
-- 20260518000001 wrote the admin policies as a sub-select on profiles itself,
-- which recurses ("infinite recursion detected in policy") on a fresh database.
-- Production already runs them through is_admin(); recreate them that way so
-- the migration files reproduce production. No-op where they already match.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. profiles guard: backend role, DELETE branch, advisory lock ───────────
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_privileged boolean := public.is_backend_role() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_privileged and (new.role is distinct from 'viewer' or new.person_id is not null) then
      raise exception 'Only an admin can set role or person_id' using errcode = '42501';
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
    ) then
      raise exception 'Only an admin can change role or person_id' using errcode = '42501';
    end if;
  end if;

  -- UPDATE that demotes an admin, or DELETE of an admin: never the last one.
  -- Only admins (who can read every profile) and backend roles (which bypass
  -- RLS) can reach this point with an admin row, so the count below is exact.
  -- The lock serialises concurrent removals; the query after it takes a fresh
  -- snapshot, so it sees any removal that committed while we waited.
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

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update or delete on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- ── link_requests guard: backend role instead of auth.uid() is null ────────
-- Body unchanged apart from v_admin. As SECURITY INVOKER the "already linked"
-- lookup runs under the caller's RLS; a member only ever looks up their own
-- profile row there (profile_id = auth.uid() is checked first), which
-- profiles_select_self allows.
create or replace function public.guard_link_request()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_admin boolean := public.is_backend_role() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_admin then
      if new.profile_id is distinct from auth.uid() then
        raise exception 'You can only request a link for your own account' using errcode = '42501';
      end if;
      if new.status <> 'pending' or new.reviewed_by is not null or new.reviewed_at is not null then
        raise exception 'New requests must be pending' using errcode = '42501';
      end if;
      if exists (select 1 from public.profiles p where p.id = new.profile_id and p.person_id is not null) then
        raise exception 'This account is already linked to a person' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: identity columns never change.
  if new.id is distinct from old.id
     or new.profile_id is distinct from old.profile_id
     or new.created_at is distinct from old.created_at then
    raise exception 'link_requests identity columns are immutable' using errcode = '42501';
  end if;

  -- Approved / declined / cancelled are final.
  if old.status <> 'pending' then
    raise exception 'This request is already %', old.status using errcode = 'P0001';
  end if;

  if not v_admin then
    -- Members may only cancel their own pending request, nothing else.
    if new.status <> 'cancelled'
       or new.person_id is distinct from old.person_id
       or new.parents_note is distinct from old.parents_note
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Members can only cancel their own pending request' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Admin / backend: stamp the review.
  if new.status <> 'pending' then
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end; $$;

-- ── 3. audit_log.actor_id must not block account deletion ──────────────────
-- Inline "references public.profiles(id)" in 20260518000002_audit_log.sql
-- produced the default name audit_log_actor_id_fkey.
alter table public.audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table public.audit_log
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

-- ── 4. profile audit without email / date of birth ─────────────────────────
-- Profiles get their own audit function so every other table keeps using
-- log_audit() unchanged.
create or replace function public.log_audit_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
begin
  -- The actor's own profile may be the row being deleted; an actor_id that no
  -- longer exists would violate the foreign key and abort the delete.
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  insert into public.audit_log (actor_id, table_name, row_id, operation, before, after)
  values (
    v_actor,
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) - 'email' - 'date_of_birth' end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) - 'email' - 'date_of_birth' end
  );
  return coalesce(new, old);
end; $$;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit_profiles();

-- Scrub anything already logged by the earlier profiles_audit trigger.
update public.audit_log
set before = before - 'email' - 'date_of_birth',
    after  = after  - 'email' - 'date_of_birth'
where table_name = 'profiles'
  and (before ?| array['email', 'date_of_birth'] or after ?| array['email', 'date_of_birth']);

-- ── 5. date of birth floor: 1900-01-01 everywhere ──────────────────────────
update public.profiles set date_of_birth = null where date_of_birth < date '1900-01-01';

alter table public.profiles drop constraint if exists profiles_date_of_birth_min;
alter table public.profiles
  add constraint profiles_date_of_birth_min
  check (date_of_birth is null or date_of_birth >= date '1900-01-01');

-- Same as 20260521000015 except the floor. Out-of-range dates are still
-- dropped silently so a bad date can never block sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_full_name text := left(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), 120);
  v_dob date;
begin
  begin
    v_dob := nullif(btrim(new.raw_user_meta_data->>'date_of_birth'), '')::date;
  exception when others then
    v_dob := null;
  end;
  if v_dob is not null and (v_dob > current_date or v_dob < date '1900-01-01') then
    v_dob := null;
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

-- ── admin-only: sign-in status from auth.users ─────────────────────────────
-- Lets /admin/members show "email not confirmed" (and the current email, which
-- profiles.email does not follow after an address change) without the
-- service-role key. Returns nothing unless the caller is an admin.
create or replace function public.admin_member_auth_status()
returns table (id uuid, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, u.email_confirmed_at, u.last_sign_in_at
  from auth.users u
  where public.is_admin();
$$;
revoke all on function public.admin_member_auth_status() from public, anon;
grant execute on function public.admin_member_auth_status() to authenticated;
