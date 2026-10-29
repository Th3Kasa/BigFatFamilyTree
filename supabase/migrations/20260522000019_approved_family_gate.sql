-- Approved family only.
--
-- The site is shared with the whole family, so being signed in is no longer
-- enough to read family data: an admin must let the account in first.
--
--  1. profiles.approved_at / approved_by record when and by whom. Every account
--     that exists today is approved now (backfill).
--  2. public.is_approved() is what the policies ask: the caller's profile is
--     approved, or the caller is an admin (admins can never lock themselves out).
--  3. The profiles guard trigger stops non-admins from touching approval.
--  4. SELECT on people / events / relationships / transcripts /
--     extraction_proposals and on the photos + audio storage buckets now needs
--     is_approved() instead of "any signed-in user". Write policies are unchanged.
--  5. Unapproved accounts can still find themselves on /welcome through two
--     narrow SECURITY DEFINER functions that return a few display columns only.
--
-- Mirrored in lib/members/approval.ts and lib/members/claim-query.ts (unit-tested).

-- ── 1. approval columns ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;

comment on column public.profiles.approved_at is 'When an admin let this account in. null = waiting for access. Only admins/backend roles may change it.';
comment on column public.profiles.approved_by is 'The admin who let this account in (null for the original backfill).';

-- ── 2. helper used by every gated policy ────────────────────────────────────
-- SECURITY DEFINER so it can read profiles without recursing through the
-- profiles policies (same reason as is_admin()). Policies call it as
-- (select public.is_approved()) so Postgres evaluates it once per statement.
create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.approved_at is not null or p.role = 'admin')
  );
$$;

-- ── 3. guard trigger: approval is admin/backend only ────────────────────────
-- Same shape as 20260521000018 (SECURITY INVOKER, is_backend_role() or
-- is_admin()), plus approved_at / approved_by.
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_privileged boolean := public.is_backend_role() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_privileged and (
         new.role is distinct from 'viewer'
      or new.person_id is not null
      or new.approved_at is not null
      or new.approved_by is not null
    ) then
      raise exception 'Only an admin can set role, person_id or approval' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'profiles.id is immutable' using errcode = '42501';
    end if;
    if not v_privileged and (
         new.role is distinct from old.role
      or new.person_id is distinct from old.person_id
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
    ) then
      raise exception 'Only an admin can change role, person_id or approval' using errcode = '42501';
    end if;

    -- An admin's access cannot be removed (demote them first).
    if new.role = 'admin' and old.approved_at is not null and new.approved_at is null then
      raise exception 'Admins always have access' using errcode = 'P0001', hint = 'admin_access';
    end if;

    -- Keep approved_by honest: stamp the approving admin, clear it on removal.
    if new.approved_at is null then
      new.approved_by := null;
    elsif old.approved_at is null and new.approved_by is null then
      new.approved_by := auth.uid();
    end if;
  end if;

  -- UPDATE that demotes an admin, or DELETE of an admin: never the last one.
  -- (Unchanged from 20260521000018.)
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role is distinct from 'admin') then
    perform pg_advisory_xact_lock(hashtext('profiles_last_admin'));
    if not exists (
      select 1 from public.profiles p where p.role = 'admin' and p.id <> old.id
    ) then
      raise exception 'Cannot remove the last admin'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end; $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update or delete on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Everyone who has an account today is part of the family: approve them now.
-- Runs as the migration role, which the guard treats as a backend role.
update public.profiles set approved_at = now() where approved_at is null;

-- ── 4. read access: approved family only ────────────────────────────────────
-- old: using (auth.uid() is not null)   new: using ((select public.is_approved()))
drop policy if exists people_select_authenticated on public.people;
create policy people_select_approved on public.people
  for select using ((select public.is_approved()));

drop policy if exists events_select_authenticated on public.events;
create policy events_select_approved on public.events
  for select using ((select public.is_approved()));

drop policy if exists relationships_select_authenticated on public.relationships;
create policy relationships_select_approved on public.relationships
  for select using ((select public.is_approved()));

drop policy if exists transcripts_select_authenticated on public.transcripts;
create policy transcripts_select_approved on public.transcripts
  for select using ((select public.is_approved()));

drop policy if exists proposals_select_authenticated on public.extraction_proposals;
create policy proposals_select_approved on public.extraction_proposals
  for select using ((select public.is_approved()));

-- Storage. old photos: bucket_id = 'photos' (anyone)
--         old audio:  bucket_id = 'audio' and auth.uid() is not null
-- NOTE: the photos bucket is PUBLIC, so a direct /object/public/photos/<path> URL
-- is served without consulting this policy. The policy covers the authenticated
-- API (list, download, signed URLs). Making the bucket private is a separate,
-- code-affecting change; see the hand-off notes.
drop policy if exists "photos_public_read" on storage.objects;
create policy "photos_approved_read" on storage.objects
  for select using (bucket_id = 'photos' and (select public.is_approved()));

drop policy if exists "audio_authenticated_read" on storage.objects;
create policy "audio_approved_read" on storage.objects
  for select using (bucket_id = 'audio' and (select public.is_approved()));

-- ── 5. "find yourself" for accounts that cannot read people yet ─────────────

-- Fold case, Arabic letter variants and tashkeel so "Ahmad" / "أحمد" compare
-- sanely (mirrors normalizeName() in lib/members/match.ts).
create or replace function public._claim_norm(s text)
returns text
language sql immutable parallel safe set search_path = public as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(s, '')), 'أإآٱىة', 'اااايه'),
        '[ً-ٰٟـ]', '', 'g'),
      '[^\w\s]', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- One row per real, visible person with only the columns the claim screen may
-- show, plus search helpers. INTERNAL: no client role can execute it; the two
-- public functions below (owned by the same role) call it.
create or replace function public._claim_cards()
returns table (
  id uuid,
  given_en text, given_ar text, family_name_en text, family_name_ar text,
  birth_year int, birth_ymd int[],
  father_name_en text, father_name_ar text, mother_name_en text, mother_name_ar text,
  prim text, sec text
)
language sql stable security definer set search_path = public as $$
  with src as (
    select p.*,
      translate(coalesce(p.birth_date, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789') as bd
    from public.people p
    where p.deleted_at is null and not p.is_placeholder
  )
  select
    s.id, s.given_en, s.given_ar, s.family_name_en, s.family_name_ar,
    (regexp_match(s.bd, '\m([12][0-9]{3})\M'))[1]::int as birth_year,
    coalesce(
      (select array[a[1]::int, a[2]::int, a[3]::int]
         from regexp_match(s.bd, '^\s*([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})') a),
      (select array[b[3]::int, b[2]::int, b[1]::int]
         from regexp_match(s.bd, '^\s*([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{4})\s*$') b)
    ) as birth_ymd,
    -- Parents: the linked person if there is one, else the typed-in name.
    case when nullif(btrim(coalesce(f.given_en, f.given_ar)), '') is not null
         then coalesce(nullif(btrim(f.given_en), ''), nullif(btrim(f.given_ar), ''))
         else coalesce(nullif(btrim(s.father_name_en), ''), nullif(btrim(s.father_name_ar), '')) end,
    case when nullif(btrim(coalesce(f.given_en, f.given_ar)), '') is not null
         then coalesce(nullif(btrim(f.given_ar), ''), nullif(btrim(f.given_en), ''))
         else coalesce(nullif(btrim(s.father_name_ar), ''), nullif(btrim(s.father_name_en), '')) end,
    coalesce(nullif(btrim(m.given_en), ''), nullif(btrim(m.given_ar), '')),
    coalesce(nullif(btrim(m.given_ar), ''), nullif(btrim(m.given_en), '')),
    public._claim_norm(concat_ws(' ', s.given_en, s.given_ar, s.family_name_en, s.family_name_ar)),
    public._claim_norm(concat_ws(' ', s.father_name_en, s.father_name_ar,
      s.grandfather_name_en, s.grandfather_name_ar,
      s.great_grandfather_name_en, s.great_grandfather_name_ar))
  from src s
  left join public.people f on f.id = s.father_id
  left join public.people m on m.id = s.mother_id;
$$;
revoke all on function public._claim_cards() from public, anon, authenticated;

-- search_people_for_claim(q, dob): at most 20 candidates for "this is me".
--  * q must be at least 2 characters (after trimming); shorter returns nothing.
--  * Only people whose name overlaps q are returned. The date of birth is used
--    for ranking only, so it cannot be probed to find people.
--  * Rank: exact birth date, then same birth year, then name closeness (exact
--    given/family token 3, other name-chain token 2, prefix 1, +2 if every typed
--    word matched), then name. Mirrors nameScore()/rankCandidates() in
--    lib/members/match.ts.
--  * Returns the birth YEAR only, never the full date.
create or replace function public.search_people_for_claim(q text, dob date default null)
returns table (
  id uuid,
  given_en text, given_ar text, family_name_en text, family_name_ar text,
  birth_year int,
  father_name_en text, father_name_ar text, mother_name_en text, mother_name_ar text,
  dob_match text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_q text := btrim(coalesce(q, ''));
  v_tokens text[];
  v_dob date := dob;
begin
  if auth.uid() is null or char_length(v_q) < 2 then
    return;
  end if;
  v_q := left(v_q, 120);
  if v_dob is not null and (v_dob < date '1900-01-01' or v_dob > current_date) then
    v_dob := null;
  end if;

  select coalesce(array_agg(w.t), '{}') into v_tokens
  from (
    select t from unnest(string_to_array(public._claim_norm(v_q), ' ')) as t
    where t <> '' limit 6
  ) w;
  if cardinality(v_tokens) = 0 then
    return;
  end if;

  return query
  with scored as (
    select c.*, ts.total, ts.matched,
      case
        when v_dob is null or c.birth_year is distinct from extract(year from v_dob)::int then 'none'
        when c.birth_ymd = array[extract(year from v_dob)::int, extract(month from v_dob)::int, extract(day from v_dob)::int] then 'exact'
        else 'year'
      end as dob_match
    from public._claim_cards() c
    cross join lateral (
      select coalesce(sum(x.s), 0) as total, count(*) filter (where x.s > 0) as matched
      from (
        select case
          when t = any (string_to_array(c.prim, ' ')) then 3
          when t = any (string_to_array(c.sec, ' ')) then 2
          when char_length(t) >= 2 and exists (
            select 1 from unnest(string_to_array(c.prim || ' ' || c.sec, ' ')) as word
            where left(word, char_length(t)) = t
          ) then 1
          else 0 end as s
        from unnest(v_tokens) as t
      ) x
    ) ts
  )
  select s.id, s.given_en, s.given_ar, s.family_name_en, s.family_name_ar,
         s.birth_year,
         s.father_name_en, s.father_name_ar, s.mother_name_en, s.mother_name_ar,
         s.dob_match
  from scored s
  where s.total > 0
  order by
    case s.dob_match when 'exact' then 0 when 'year' then 1 else 2 end,
    (s.total + case when s.matched = cardinality(v_tokens) then 2 else 0 end) desc,
    coalesce(s.given_en, s.given_ar, '') || ' ' || coalesce(s.family_name_en, s.family_name_ar, ''),
    s.id
  limit 20;
end; $$;
revoke all on function public.search_people_for_claim(text, date) from public, anon;
grant execute on function public.search_people_for_claim(text, date) to authenticated;

-- my_pending_claim_person(): the person the caller asked to be linked to, so
-- the "waiting for an admin" screen can name them. Own pending request only.
create or replace function public.my_pending_claim_person()
returns table (
  id uuid,
  given_en text, given_ar text, family_name_en text, family_name_ar text,
  birth_year int,
  father_name_en text, father_name_ar text, mother_name_en text, mother_name_ar text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.given_en, c.given_ar, c.family_name_en, c.family_name_ar,
         c.birth_year,
         c.father_name_en, c.father_name_ar, c.mother_name_en, c.mother_name_ar
  from public.link_requests lr
  join public._claim_cards() c on c.id = lr.person_id
  where lr.profile_id = auth.uid() and lr.status = 'pending'
  limit 1;
$$;
revoke all on function public.my_pending_claim_person() from public, anon;
grant execute on function public.my_pending_claim_person() to authenticated;
