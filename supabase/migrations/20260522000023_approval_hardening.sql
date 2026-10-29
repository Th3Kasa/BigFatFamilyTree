-- Approved family only, part 2: close two gaps found in the security review.
--
--  1. The editor write policies are FOR ALL, and a FOR ALL policy also grants
--     SELECT. An editor whose access was removed (approved_at = null), or a
--     waiting account an admin made an editor, could still read and change every
--     person, event, relationship, transcript and proposal, and upload/delete
--     photos and audio, straight through the API. Every write policy now also
--     needs is_approved().
--  2. search_people_for_claim(q, dob) returned dob_match = 'exact' for a date
--     the CALLER supplied, so anyone with an account could recover a person's
--     full date of birth by trying dates (the birth year is already returned).
--     The function now ranks by the caller's own profiles.date_of_birth, which
--     members cannot change; the dob argument is accepted and ignored so the
--     signature (and the app's call) stays the same.

-- ── 1. write policies: editor/admin AND approved ───────────────────────────
drop policy if exists people_write_editor on public.people;
create policy people_write_editor on public.people
  for all using (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

drop policy if exists events_write_editor on public.events;
create policy events_write_editor on public.events
  for all using (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

drop policy if exists relationships_write_editor on public.relationships;
create policy relationships_write_editor on public.relationships
  for all using (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

drop policy if exists transcripts_write_editor on public.transcripts;
create policy transcripts_write_editor on public.transcripts
  for all using (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

drop policy if exists proposals_write_editor on public.extraction_proposals;
create policy proposals_write_editor on public.extraction_proposals
  for all using (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) with check (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- Storage writes (same rule).
drop policy if exists "photos_editor_insert" on storage.objects;
create policy "photos_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and (select public.is_approved())
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'editor'))
  );

drop policy if exists "photos_editor_delete" on storage.objects;
create policy "photos_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and (select public.is_approved())
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'editor'))
  );

drop policy if exists "audio_editor_insert" on storage.objects;
create policy "audio_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'audio'
    and (select public.is_approved())
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'editor'))
  );

drop policy if exists "audio_editor_delete" on storage.objects;
create policy "audio_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'audio'
    and (select public.is_approved())
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'editor'))
  );

-- ── 2. claim search: rank by the caller's own date of birth ─────────────────
-- Identical to 20260522000019 except where v_dob comes from.
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
  v_dob date;
begin
  if auth.uid() is null or char_length(v_q) < 2 then
    return;
  end if;
  v_q := left(v_q, 120);
  -- The `dob` argument is ignored on purpose: a caller-chosen date would turn
  -- dob_match into an oracle for anyone's full date of birth. The profile's
  -- date of birth is set at sign-up and only an admin can change it.
  select pr.date_of_birth into v_dob from public.profiles pr where pr.id = auth.uid();
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
