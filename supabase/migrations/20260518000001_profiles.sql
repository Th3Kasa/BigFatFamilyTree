-- Roles
do $$ begin
  create type user_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

-- Profiles: 1:1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role user_role not null default 'viewer',
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read their own row; admins can read all.
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Only admins can insert/update/delete profiles (i.e. manage users).
create policy profiles_admin_write on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Helper: auto-create a profile row when a new auth.users row appears.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'viewer')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
