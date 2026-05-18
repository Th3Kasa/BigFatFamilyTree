do $$ begin
  create type proposal_status_type as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.extraction_proposals (
  id                uuid primary key default gen_random_uuid(),
  transcript_id     uuid not null references public.transcripts(id) on delete cascade,
  proposed_changes  jsonb not null default '[]',
  confidence_notes  jsonb not null default '[]',
  status            proposal_status_type not null default 'pending',
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.extraction_proposals enable row level security;

create policy proposals_select_authenticated on public.extraction_proposals
  for select using (auth.uid() is not null);

create policy proposals_write_editor on public.extraction_proposals
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );
