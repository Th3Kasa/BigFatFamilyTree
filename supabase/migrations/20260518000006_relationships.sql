do $$ begin
  create type relationship_type as enum ('spouse', 'adopted_by', 'raised_by', 'godparent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type relationship_status_type as enum ('current', 'divorced', 'widowed');
exception when duplicate_object then null; end $$;

create table if not exists public.relationships (
  id           uuid primary key default gen_random_uuid(),
  type         relationship_type not null,
  person_a_id  uuid not null references public.people(id) on delete cascade,
  person_b_id  uuid not null references public.people(id) on delete cascade,
  start_date   date,
  end_date     date,
  status       relationship_status_type not null default 'current',
  order_index  int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint relationships_different_people check (person_a_id != person_b_id)
);

alter table public.relationships enable row level security;

create policy relationships_select_authenticated on public.relationships
  for select using (auth.uid() is not null);

create policy relationships_write_editor on public.relationships
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

create trigger relationships_set_updated_at
  before update on public.relationships
  for each row execute function public.set_updated_at();
