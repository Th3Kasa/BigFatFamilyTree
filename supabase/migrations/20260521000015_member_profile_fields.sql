-- Member accounts, part 1: richer profiles.
--
--  * profiles gains full_name, date_of_birth, email and person_id (the link
--    from an account to its place in the family tree).
--  * handle_new_user() now copies the sign-up metadata (full_name,
--    date_of_birth) into the profile row.
--  * public.is_admin() is a SECURITY DEFINER helper so policies on other
--    tables can ask "is the caller an admin?" without recursing through the
--    profiles RLS policies.

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists date_of_birth date,
  add column if not exists email text,
  add column if not exists person_id uuid unique references public.people(id) on delete set null;

comment on column public.profiles.full_name is 'Name the member typed at sign-up';
comment on column public.profiles.date_of_birth is 'Date of birth typed at sign-up; used to rank tree matches';
comment on column public.profiles.email is 'Copy of auth.users.email so admins can see it without the service role';
comment on column public.profiles.person_id is 'The people row this account is confirmed to be. Only admins/service role may change it.';

-- Backfill email for accounts that already exist.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- Copy sign-up metadata into the profile. Bad input must never block sign-up,
-- so an unparseable or out-of-range date of birth is silently dropped.
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
  if v_dob is not null and (v_dob > current_date or v_dob < date '1800-01-01') then
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
