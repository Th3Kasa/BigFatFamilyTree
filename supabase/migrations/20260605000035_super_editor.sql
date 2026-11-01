-- Editors by default, and super editors.
--
--  * New members start as editors (they can still only edit their own close
--    family, migration 31), and existing viewers become editors.
--  * profiles.is_super_editor: an editor who may edit anyone in the tree. It
--    gives no admin powers: no approving members, changing roles or deleting
--    people they didn't add. Admins (and the backend) set it; it is cleared
--    whenever the member stops being an editor.
--  * can_edit_person / my_editable_person_ids: super editors may edit everyone.

-- ── editors by default ──────────────────────────────────────────────────────
alter table public.profiles alter column role set default 'editor';

-- Replaces 20260530000029: the same, with 'editor' for new accounts.
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
    -- A PIN account without a first name is refused outright (the server
    -- validates first, so this is the last line of defence).
    if v_first is null then
      raise exception 'A PIN account needs a first name' using errcode = '22023';
    end if;
    v_full_name := left(v_first || coalesce(' ' || v_last, ''), 120);
    insert into public.profiles
      (id, display_name, full_name, first_name, last_name, date_of_birth, email, role, login_method, name_key)
    values
      (new.id, v_full_name, v_full_name, v_first, v_last, v_dob, null, 'editor', 'pin',
       coalesce(nullif(btrim(new.raw_app_meta_data->>'name_key'), ''), public._claim_norm(v_full_name)))
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
    'editor'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Existing viewers become editors (run as the migration owner, so the profile
-- guard allows it).
update public.profiles set role = 'editor' where role = 'viewer';

-- ── super editors ───────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_super_editor boolean not null default false;
comment on column public.profiles.is_super_editor is
  'An editor who may edit anyone in the tree (no admin powers). Set by admins.';

-- Only admins (or the backend) may set or clear the flag, and it only means
-- something for editors: it is cleared when the role changes away from editor.
create or replace function public.guard_profile_super_editor()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.role is distinct from 'editor' then
    new.is_super_editor := false;
  end if;
  if (tg_op = 'INSERT' and new.is_super_editor)
     or (tg_op = 'UPDATE' and new.is_super_editor is distinct from old.is_super_editor and new.role = 'editor') then
    if not (public.is_backend_role() or public.is_admin()) then
      raise exception 'Only an admin can make someone a super editor' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_super_editor() from public, anon, authenticated;

drop trigger if exists profiles_guard_super_editor on public.profiles;
create trigger profiles_guard_super_editor
  before insert or update on public.profiles
  for each row execute function public.guard_profile_super_editor();

-- Is the caller an approved super editor?
create or replace function public.is_super_editor()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'editor' and p.is_super_editor
    from public.profiles p where p.id = auth.uid()
  ), false) and public.is_approved();
$$;
revoke execute on function public.is_super_editor() from public, anon;
grant execute on function public.is_super_editor() to authenticated;

-- Replaces 20260601000031: super editors may edit everyone.
create or replace function public.can_edit_person(p_target uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role   public.user_role;
  v_me     uuid;
  v_ok     boolean;
begin
  if p_target is null or auth.uid() is null then
    return false;
  end if;
  if public.is_admin() or public.is_super_editor() then
    return true;
  end if;
  if not public.is_approved() then
    return false;
  end if;
  select p.role, p.person_id into v_role, v_me from public.profiles p where p.id = auth.uid();
  if v_role is distinct from 'editor' then
    return false;
  end if;
  -- People they added, until another member's account is linked to that card.
  if exists (select 1 from public.people pe
             where pe.id = p_target and pe.created_by = auth.uid() and pe.deleted_at is null
               and not exists (select 1 from public.profiles pr where pr.person_id = pe.id and pr.id <> auth.uid())) then
    return true;
  end if;
  if v_me is null then
    return false;
  end if;
  select exists (select 1 from public.family_scope(v_me) s where s.id = p_target) into v_ok;
  return v_ok;
end;
$$;

-- Replaces 20260601000031: null (= everyone) for super editors too.
create or replace function public.my_editable_person_ids()
returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_role public.user_role;
  v_me   uuid;
begin
  if auth.uid() is null then
    return array[]::uuid[];
  end if;
  if public.is_admin() or public.is_super_editor() then
    return null;
  end if;
  select p.role, p.person_id into v_role, v_me from public.profiles p where p.id = auth.uid();
  if not public.is_approved() or v_role is distinct from 'editor' then
    return array[]::uuid[];
  end if;
  return coalesce((
    select array_agg(distinct x.id) from (
      select s.id from public.family_scope(v_me) s where v_me is not null
      union
      select pe.id from public.people pe
      where pe.created_by = auth.uid() and pe.deleted_at is null
        and not exists (select 1 from public.profiles pr where pr.person_id = pe.id and pr.id <> auth.uid())
    ) x
  ), array[]::uuid[]);
end;
$$;

revoke execute on function public.can_edit_person(uuid) from public, anon;
revoke execute on function public.my_editable_person_ids() from public, anon;
grant execute on function public.can_edit_person(uuid) to authenticated;
grant execute on function public.my_editable_person_ids() to authenticated;
