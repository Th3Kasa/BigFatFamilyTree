-- audio bucket: authenticated read, editor/admin write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio', 'audio', false,
  52428800,  -- 50 MB
  array['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','audio/aac']
)
on conflict (id) do nothing;

create policy "audio_authenticated_read" on storage.objects
  for select using (
    bucket_id = 'audio'
    and auth.uid() is not null
  );

create policy "audio_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'audio'
    and auth.uid() is not null
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );

create policy "audio_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'audio'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );
