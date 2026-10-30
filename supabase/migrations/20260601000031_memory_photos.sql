-- Memories with photos, written by every approved member on anyone's page.
--
--  * events.photo_paths: up to 6 photos in the private `photos` bucket, each under
--    memories/<the author's user id>/ (checked by valid_memory_photo_paths and,
--    for non-admins, by the guard below).
--  * events: any approved member may add a memory (notable_story) about anyone,
--    as themselves (contributed_by = auth.uid()); they may edit or delete their
--    own memories. Editors still manage every event of their close family
--    (events_write_scoped, migration 30); admins everything.
--  * guard_events_author(): non-admins always write as themselves, cannot
--    change an event's author, and may attach only their own uploads.
--  * storage: any approved member may upload into photos/memories/<their id>/
--    and delete their own files there. Profile photos stay with editors.

alter table public.events
  add column if not exists photo_paths text[] not null default '{}';

create or replace function public.valid_memory_photo_paths(p text[])
returns boolean
language sql immutable set search_path = public as $$
  select coalesce(cardinality(p), 0) <= 6
     and not exists (
       select 1 from unnest(coalesce(p, '{}')) x
       where x !~ '^memories/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp|gif)$'
     );
$$;

alter table public.events drop constraint if exists events_photo_paths_valid;
alter table public.events
  add constraint events_photo_paths_valid check (public.valid_memory_photo_paths(photo_paths));

-- ── who may write memories ──────────────────────────────────────────────────
drop policy if exists events_write_memory_editor on public.events;
drop policy if exists events_memory_insert_member on public.events;
drop policy if exists events_memory_update_own on public.events;
drop policy if exists events_memory_delete_own on public.events;

create policy events_memory_insert_member on public.events
  for insert with check (
    type = 'notable_story'
    and (select public.is_approved())
    and contributed_by = auth.uid()
  );

create policy events_memory_update_own on public.events
  for update
  using (type = 'notable_story' and contributed_by = auth.uid() and (select public.is_approved()))
  with check (type = 'notable_story' and contributed_by = auth.uid() and (select public.is_approved()));

create policy events_memory_delete_own on public.events
  for delete
  using (type = 'notable_story' and contributed_by = auth.uid() and (select public.is_approved()));

-- Non-admins: a new event is always theirs (contributed_by = the caller), the
-- author never changes, and photos on it must be the caller's own uploads
-- (photos already on the event may stay).
create or replace function public.guard_events_author()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_prefix text := 'memories/' || coalesce(auth.uid()::text, '') || '/';
  x text;
begin
  if public.is_backend_role() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.contributed_by := auth.uid();
    -- Where an entry came from is set by the system, never by a member.
    new.source_type := 'family_contribution';
    new.source_transcript_id := null;
    new.audio_url := null;
  else
    if new.contributed_by is distinct from old.contributed_by then
      raise exception 'The author of a memory cannot be changed' using errcode = '42501';
    end if;
    new.source_type := old.source_type;
    new.source_transcript_id := old.source_transcript_id;
    new.audio_url := old.audio_url;
  end if;
  if tg_op = 'UPDATE' and new.photo_paths is not distinct from old.photo_paths then
    return new;
  end if;
  foreach x in array coalesce(new.photo_paths, '{}') loop
    if tg_op = 'UPDATE' and x = any(coalesce(old.photo_paths, '{}')) then
      continue;  -- keeping a photo that was already there
    end if;
    if left(x, length(v_prefix)) <> v_prefix then
      raise exception 'You can only attach photos you uploaded yourself' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists events_guard_author on public.events;
create trigger events_guard_author
  before insert or update on public.events
  for each row execute function public.guard_events_author();

-- ── storage: memory photos ──────────────────────────────────────────────────
drop policy if exists "photos_member_memory_insert" on storage.objects;
drop policy if exists "photos_member_memory_delete" on storage.objects;

create policy "photos_member_memory_insert" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and (select public.is_approved())
    and (storage.foldername(name))[1] = 'memories'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "photos_member_memory_delete" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and (select public.is_approved())
    and (storage.foldername(name))[1] = 'memories'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
