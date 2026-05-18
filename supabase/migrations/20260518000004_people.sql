-- Enums
do $$ begin
  create type gender_type as enum ('m', 'f', 'unknown');
exception when duplicate_object then null; end $$;

-- People
create table if not exists public.people (
  id                       uuid primary key default gen_random_uuid(),
  given_ar                 text,
  given_en                 text,
  father_name_ar           text,
  father_name_en           text,
  grandfather_name_ar      text,
  grandfather_name_en      text,
  great_grandfather_name_ar text,
  great_grandfather_name_en text,
  family_name_ar           text,
  family_name_en           text,
  gender                   gender_type not null default 'unknown',
  father_id                uuid references public.people(id),
  mother_id                uuid references public.people(id),
  is_placeholder           boolean not null default false,
  photo_url                text,
  notes_ar                 text,
  notes_en                 text,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.people enable row level security;

create policy people_select_authenticated on public.people
  for select using (auth.uid() is not null);

create policy people_write_editor on public.people
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger people_set_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();
