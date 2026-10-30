-- Profile timeline: family members post photos, stories and video links on
-- anyone's profile, tag other people, heart and comment.
--
-- Rules (enforced here, not only in the app):
--   - Approved members can read everything and post on any profile. No approval step.
--   - A post can be deleted by its author, the member who owns the profile
--     (profiles.person_id = posts.person_id) or an admin. Deleting is soft
--     (deleted_at) through delete_post(); the Drive files are kept.
--   - Only the author can edit a post's text and date.
--   - A comment can be deleted by its author, the post's author, the profile
--     owner or an admin (delete_comment()).
--   - A tag can be removed by the post's author, the tagged person's owner or an admin.
--   - Hearts: one per member per post, added and removed by that member.
--
-- Photos live in the admin's Google Drive (drive_connection). The app only
-- stores Drive file ids; bytes are served through /api/media after an
-- approval check. drive_connection and media_uploads hold secrets/session
-- URLs and are server-only (RLS on, no policies).

-- ── Drive connection (one row, server-only) ─────────────────────────────────
create table if not exists public.drive_connection (
  id               smallint primary key default 1 check (id = 1),
  refresh_token_enc text not null,
  google_email     text,
  root_folder_id   text not null,
  connected_by     uuid references public.profiles(id) on delete set null,
  connected_at     timestamptz not null default now()
);
alter table public.drive_connection enable row level security;
-- No policies: only the service role (server code) can read or write it.

-- ── Posts ───────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.people(id) on delete cascade,
  author_id       uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  author_name     text not null check (char_length(author_name) between 1 and 120),
  title           text check (char_length(title) <= 200),
  body            text check (char_length(body) <= 10000),
  date_value      date,
  date_precision  date_precision_type not null default 'year',
  location        text check (char_length(location) <= 200),
  video_provider  text check (video_provider in ('youtube', 'facebook', 'instagram')),
  video_ref       text check (char_length(video_ref) <= 500),
  video_url       text check (char_length(video_url) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  deleted_by      uuid references public.profiles(id) on delete set null,
  check ((video_provider is null) = (video_ref is null))
);
create index if not exists posts_person_idx on public.posts (person_id) where deleted_at is null;

create table if not exists public.post_media (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references public.posts(id) on delete cascade,
  position         smallint not null check (position between 0 and 4),
  drive_original_id text not null,
  drive_display_id  text not null,
  mime             text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  bytes_original   integer not null check (bytes_original > 0 and bytes_original <= 15728640),
  width            integer check (width > 0),
  height           integer check (height > 0),
  unique (post_id, position)
);
create index if not exists post_media_post_idx on public.post_media (post_id);

create table if not exists public.post_tags (
  post_id    uuid not null references public.posts(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete cascade,
  primary key (post_id, person_id)
);
create index if not exists post_tags_person_idx on public.post_tags (person_id);

create table if not exists public.post_hearts (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  author_name text not null check (char_length(author_name) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles(id) on delete set null
);
create index if not exists post_comments_post_idx on public.post_comments (post_id) where deleted_at is null;

-- Resumable Drive uploads in progress (server-only). The session URL lets
-- anyone holding it upload into that one file, so it never leaves the server.
create table if not exists public.media_uploads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  variant        text not null check (variant in ('original', 'display')),
  mime           text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  expected_bytes integer not null check (expected_bytes > 0 and expected_bytes <= 15728640),
  session_url    text not null,
  received_bytes integer not null default 0,
  drive_file_id  text,
  created_at     timestamptz not null default now()
);
create index if not exists media_uploads_user_idx on public.media_uploads (user_id, created_at);

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.owns_person(p_person uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.person_id = p_person);
$$;
revoke all on function public.owns_person(uuid) from public, anon;
grant execute on function public.owns_person(uuid) to authenticated;

-- The author's name on posts and comments always comes from their own
-- profile (the same order the app uses), so nobody can post as someone else.
create or replace function public.member_display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select left(coalesce(
    nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
    nullif(trim(pr.display_name), ''),
    nullif(trim(pr.full_name), ''),
    nullif(trim(concat_ws(' ', coalesce(pe.given_en, pe.given_ar), coalesce(pe.family_name_en, pe.family_name_ar))), ''),
    'A family member'
  ), 120)
  from public.profiles pr
  left join public.people pe on pe.id = pr.person_id
  where pr.id = p_user;
$$;
revoke all on function public.member_display_name(uuid) from public, anon;
grant execute on function public.member_display_name(uuid) to authenticated;

create or replace function public.stamp_author()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    new.author_name := coalesce(public.member_display_name(auth.uid()), 'A family member');
  end if;
  return new;
end;
$$;
drop trigger if exists posts_stamp_author on public.posts;
create trigger posts_stamp_author before insert on public.posts
  for each row execute function public.stamp_author();
drop trigger if exists post_comments_stamp_author on public.post_comments;
create trigger post_comments_stamp_author before insert on public.post_comments
  for each row execute function public.stamp_author();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_tags enable row level security;
alter table public.post_hearts enable row level security;
alter table public.post_comments enable row level security;
alter table public.media_uploads enable row level security;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select
  using ((select public.is_approved()) and deleted_at is null);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert
  with check ((select public.is_approved()) and author_id = auth.uid() and deleted_at is null and deleted_by is null);
drop policy if exists posts_update_author on public.posts;
create policy posts_update_author on public.posts for update
  using ((select public.is_approved()) and author_id = auth.uid() and deleted_at is null)
  with check (author_id = auth.uid() and deleted_at is null);

-- Authors may only change the words and the date; delete_post() handles deletes.
create or replace function public.guard_post_update()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.person_id is distinct from old.person_id
     or new.author_id is distinct from old.author_id
     or new.author_name is distinct from old.author_name
     or new.created_at is distinct from old.created_at
     or new.video_provider is distinct from old.video_provider
     or new.video_ref is distinct from old.video_ref
     or new.video_url is distinct from old.video_url then
    raise exception 'These fields cannot be changed.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists posts_guard_update on public.posts;
create trigger posts_guard_update before update on public.posts
  for each row when (current_setting('app.post_delete', true) is distinct from 'on')
  execute function public.guard_post_update();

drop policy if exists post_media_read on public.post_media;
create policy post_media_read on public.post_media for select
  using (exists (select 1 from public.posts p where p.id = post_id));
-- No insert policy: photos are attached by the server after it has checked
-- the uploads belong to the author (lib/actions/timeline.ts).

drop policy if exists post_tags_read on public.post_tags;
create policy post_tags_read on public.post_tags for select
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists post_tags_insert on public.post_tags;
create policy post_tags_insert on public.post_tags for insert
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));
drop policy if exists post_tags_delete on public.post_tags;
create policy post_tags_delete on public.post_tags for delete
  using (
    (select public.is_approved()) and (
      public.owns_person(person_id)
      or (select public.is_admin())
      or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
    )
  );

drop policy if exists post_hearts_read on public.post_hearts;
create policy post_hearts_read on public.post_hearts for select
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists post_hearts_insert on public.post_hearts;
create policy post_hearts_insert on public.post_hearts for insert
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists post_hearts_delete on public.post_hearts;
create policy post_hearts_delete on public.post_hearts for delete
  using (user_id = auth.uid());

drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments for select
  using (deleted_at is null and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments for insert
  with check (
    author_id = auth.uid() and deleted_at is null and deleted_by is null
    and exists (select 1 from public.posts p where p.id = post_id)
  );

-- No policies on media_uploads: only the server (service role) touches it,
-- so nobody can point an upload at someone else's Drive file.

-- ── Deletes ─────────────────────────────────────────────────────────────────
create or replace function public.delete_post(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.posts;
begin
  if not public.is_approved() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into p from public.posts where id = p_post and deleted_at is null;
  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;
  if not (p.author_id = auth.uid() or public.owns_person(p.person_id) or public.is_admin()) then
    raise exception 'Only the author, the profile owner or an admin can delete this.' using errcode = '42501';
  end if;
  perform set_config('app.post_delete', 'on', true);
  update public.posts set deleted_at = now(), deleted_by = auth.uid() where id = p_post;
  perform set_config('app.post_delete', 'off', true);
end;
$$;
revoke all on function public.delete_post(uuid) from public, anon;
grant execute on function public.delete_post(uuid) to authenticated;

create or replace function public.delete_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.post_comments;
  p public.posts;
begin
  if not public.is_approved() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into c from public.post_comments where id = p_comment and deleted_at is null;
  if not found then
    raise exception 'Comment not found.' using errcode = 'P0002';
  end if;
  select * into p from public.posts where id = c.post_id;
  if not (c.author_id = auth.uid() or p.author_id = auth.uid() or public.owns_person(p.person_id) or public.is_admin()) then
    raise exception 'Only the comment author, the post author, the profile owner or an admin can delete this.' using errcode = '42501';
  end if;
  update public.post_comments set deleted_at = now(), deleted_by = auth.uid() where id = p_comment;
end;
$$;
revoke all on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated;

-- Audit like the other family tables.
drop trigger if exists posts_audit on public.posts;
create trigger posts_audit after insert or update or delete on public.posts
  for each row execute function public.log_audit();
