-- When a timeline post is deleted, its photos are moved to the Google Drive
-- bin (Google empties it after 30 days, so it doubles as an undo). This column
-- records which photos have been binned, so the clean-up runs once per photo
-- and retries anything Drive couldn't take at the time.

alter table public.post_media
  add column if not exists drive_trashed_at timestamptz;

create index if not exists post_media_untrashed_idx
  on public.post_media (post_id)
  where drive_trashed_at is null;
