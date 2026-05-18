create table if not exists public.transcripts (
  id             uuid primary key default gen_random_uuid(),
  audio_url      text not null,
  raw_text_ar    text,
  segments       jsonb,
  recorded_at    date,
  recorded_with  uuid references public.people(id),
  uploaded_by    uuid not null references public.profiles(id),
  created_at     timestamptz not null default now()
);

alter table public.transcripts enable row level security;

create policy transcripts_select_authenticated on public.transcripts
  for select using (auth.uid() is not null);

create policy transcripts_write_editor on public.transcripts
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

alter table public.events
  add constraint events_source_transcript_id_fkey
  foreign key (source_transcript_id) references public.transcripts(id);
