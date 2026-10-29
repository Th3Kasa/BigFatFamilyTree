-- Member accounts, part 2: protect the privileged profile columns.
--
-- Existing RLS on profiles only lets admins write (profiles_admin_write), so a
-- signed-in member cannot touch their own row today. This trigger is the
-- belt-and-braces layer: even if a self-update policy is ever added (for
-- display name, canvas viewport, ...), nobody but an admin or the service role
-- can change `role` or `person_id`.
--
-- "Privileged" means:
--   * auth.uid() is null  -> service role key, the sign-up trigger, migrations
--   * public.is_admin()   -> a signed-in admin
--
-- It also refuses to demote the last remaining admin, whoever asks.
-- (Mirrored in lib/members/rules.ts, which is unit-tested.)

create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_privileged boolean := (auth.uid() is null) or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_privileged and (new.role is distinct from 'viewer' or new.person_id is not null) then
      raise exception 'Only an admin can set role or person_id' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable' using errcode = '42501';
  end if;

  if not v_privileged and (
       new.role is distinct from old.role
    or new.person_id is distinct from old.person_id
  ) then
    raise exception 'Only an admin can change role or person_id' using errcode = '42501';
  end if;

  if old.role = 'admin' and new.role is distinct from 'admin' then
    if not exists (
      select 1 from public.profiles p where p.role = 'admin' and p.id <> old.id
    ) then
      raise exception 'Cannot remove the last admin' using errcode = 'P0001';
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Audit trail for role / link changes (same pattern as people, events, ...).
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit();
