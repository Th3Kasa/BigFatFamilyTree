create table if not exists public.settings (
  id int primary key check (id = 1),
  focal_person_id uuid,
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;

create policy settings_select_authenticated on public.settings
  for select using (auth.role() = 'authenticated');

create policy settings_update_admin on public.settings
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
