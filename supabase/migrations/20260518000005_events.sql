do $$ begin
  create type event_type as enum (
    'birth', 'death', 'marriage', 'divorce', 'engagement',
    'migration', 'education', 'notable_story', 'custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type date_precision_type as enum (
    'exact', 'year', 'decade', 'before', 'after', 'around'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_source_type as enum (
    'grandma_transcript', 'family_contribution', 'document', 'admin'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.events (
  id                   uuid primary key default gen_random_uuid(),
  person_id            uuid not null references public.people(id) on delete cascade,
  type                 event_type not null,
  custom_label         text,
  date_value           date,
  date_precision       date_precision_type not null default 'exact',
  location             text,
  story_ar             text,
  story_en             text,
  audio_url            text,
  source_transcript_id uuid,
  source_type          event_source_type not null default 'admin',
  contributed_by       uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.events enable row level security;

create policy events_select_authenticated on public.events
  for select using (auth.uid() is not null);

create policy events_write_editor on public.events
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
