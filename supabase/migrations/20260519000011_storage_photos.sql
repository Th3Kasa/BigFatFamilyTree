-- photos bucket: public read, editor/admin write
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos', 'photos', true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Anyone can read photos (bucket is public but policy is also needed)
create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'photos');

-- Only editors/admins can upload
create policy "photos_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and auth.uid() is not null
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );

-- Only editors/admins can delete (for re-upload / cleanup)
create policy "photos_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'editor')
    )
  );
