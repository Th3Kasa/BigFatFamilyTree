-- Simpler join: family PIN, first name, own PIN. Birthday only when needed.
--
-- A new PIN member gives just a first name. The birthday is asked for only when
-- another PIN account already has that first name, so two people are always
-- told apart by first name + birthday. The last name is no longer asked for.
--
--  * profiles_pin_identity_check: a PIN account needs a name_key; the birthday
--    is optional.
--  * profiles_pin_identity_nobirthday_uidx: at most one PIN account per name_key
--    WITHOUT a birthday (the existing (name_key, date_of_birth) index treats
--    NULL birthdays as distinct, so it would not catch two "samuel"s with none).
--  * handle_new_user(): a PIN account needs a first name only.
--
-- The server (lib/auth/pin-session.ts) decides when the birthday is required;
-- these are the last line of defence against a race between two joins.

alter table public.profiles drop constraint if exists profiles_pin_identity_check;
alter table public.profiles
  add constraint profiles_pin_identity_check
  check (login_method <> 'pin' or name_key is not null);

comment on column public.profiles.name_key is
  'Normalised lower-case name (first name, or first + last for older accounts); with date_of_birth (when set) it identifies a PIN account';

create unique index if not exists profiles_pin_identity_nobirthday_uidx
  on public.profiles (name_key)
  where login_method = 'pin' and date_of_birth is null;

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
      (new.id, v_full_name, v_full_name, v_first, v_last, v_dob, null, 'viewer', 'pin',
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
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end; $$;
