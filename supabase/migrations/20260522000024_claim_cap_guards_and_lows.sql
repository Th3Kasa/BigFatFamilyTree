-- Privacy gate, part 3: review fixes.
--
--  H3  Claim search enumeration. search_people_for_claim now
--        * for accounts WAITING for access: needs a first AND a family name
--          (two words, 2+ characters each, each a whole word or the start of the
--          matching name part), never returns parents' names, and is capped at
--          30 distinct searches per account per day (claim_search_log, written
--          by the security-definer function);
--        * for approved accounts and admins: unchanged richer output, no cap.
--      my_pending_claim_person hides parents from unapproved callers too.
--  M1  The link_requests / relative_suggestions guards let a backend role clear
--      reviewed_by / handled_by (ON DELETE SET NULL when a reviewing admin is
--      deleted) even on a request that is already final.
--  Low first_admin_name() says "the family admins" to anyone not approved.
--  Low Only the owner (or a backend role) can change the super admin's own
--      person link, names, birthday or email.

-- ── H3: per-account daily counter ───────────────────────────────────────────
create table if not exists public.claim_search_log (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  day        date not null default current_date,
  n          int  not null default 0,
  last_q     text,
  primary key (profile_id, day)
);
alter table public.claim_search_log enable row level security;  -- no policies: only the definer function touches it
revoke all on public.claim_search_log from public, anon, authenticated;

create or replace function public.search_people_for_claim(q text, dob date default null)
returns table (
  id uuid,
  given_en text, given_ar text, family_name_en text, family_name_ar text,
  birth_year int,
  father_name_en text, father_name_ar text, mother_name_en text, mother_name_ar text,
  dob_match text
)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_q        text := btrim(coalesce(q, ''));
  v_tokens   text[];
  v_dob      date;
  v_approved boolean := public.is_approved();
  v_norm     text;
  v_used     int;
begin
  if auth.uid() is null or char_length(v_q) < 2 then
    return;
  end if;
  v_q := left(v_q, 120);
  -- The `dob` argument is ignored on purpose (see 20260522000023).
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

  if not v_approved then
    -- A first AND a family name, each at least 2 characters: no one-word dumps.
    if cardinality(v_tokens) < 2 or exists (select 1 from unnest(v_tokens) as t where char_length(t) < 2) then
      return;
    end if;
    -- Daily cap. Repeating the same search does not use up another one.
    delete from public.claim_search_log where day < current_date - 7;
    v_norm := array_to_string(v_tokens, ' ');
    insert into public.claim_search_log as l (profile_id, day, n, last_q)
    values (auth.uid(), current_date, 1, v_norm)
    on conflict (profile_id, day) do update
      set n = case when l.last_q = v_norm then l.n else l.n + 1 end,
          last_q = v_norm
    returning l.n into v_used;
    if v_used > 30 then
      raise exception 'Too many searches today' using errcode = 'P0001', hint = 'claim_search_limit';
    end if;
  end if;

  return query
  with scored as (
    select c.*, ts.total, ts.matched,
      public._claim_norm(concat_ws(' ', p.given_en, p.given_ar)) as gnorm,
      public._claim_norm(concat_ws(' ', p.family_name_en, p.family_name_ar)) as fnorm,
      case
        when v_dob is null or c.birth_year is distinct from extract(year from v_dob)::int then 'none'
        when c.birth_ymd = array[extract(year from v_dob)::int, extract(month from v_dob)::int, extract(day from v_dob)::int] then 'exact'
        else 'year'
      end as dob_match
    from public._claim_cards() c
    join public.people p on p.id = c.id
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
         case when v_approved then s.father_name_en end,
         case when v_approved then s.father_name_ar end,
         case when v_approved then s.mother_name_en end,
         case when v_approved then s.mother_name_ar end,
         s.dob_match
  from scored s
  where s.total > 0
    and (
      v_approved
      or exists (
        -- one query word starts a given name, a different one starts a family name
        select 1
        from unnest(v_tokens) with ordinality as a(t, i)
        join unnest(v_tokens) with ordinality as b(t, i) on a.i <> b.i
        where exists (select 1 from unnest(string_to_array(s.gnorm, ' ')) g where left(g, char_length(a.t)) = a.t)
          and exists (select 1 from unnest(string_to_array(s.fnorm, ' ')) f where left(f, char_length(b.t)) = b.t)
      )
    )
  order by
    case s.dob_match when 'exact' then 0 when 'year' then 1 else 2 end,
    (s.total + case when s.matched = cardinality(v_tokens) then 2 else 0 end) desc,
    coalesce(s.given_en, s.given_ar, '') || ' ' || coalesce(s.family_name_en, s.family_name_ar, ''),
    s.id
  limit 20;
end; $$;
revoke all on function public.search_people_for_claim(text, date) from public, anon;
grant execute on function public.search_people_for_claim(text, date) to authenticated;

-- Parents stay hidden until the account is approved.
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
         case when public.is_approved() then c.father_name_en end,
         case when public.is_approved() then c.father_name_ar end,
         case when public.is_approved() then c.mother_name_en end,
         case when public.is_approved() then c.mother_name_ar end
  from public.link_requests lr
  join public._claim_cards() c on c.id = lr.person_id
  where lr.profile_id = auth.uid() and lr.status = 'pending'
  limit 1;
$$;
revoke all on function public.my_pending_claim_person() from public, anon;
grant execute on function public.my_pending_claim_person() to authenticated;

-- ── M1: guards (full bodies; the only change is the early return) ──────────
create or replace function public.guard_link_request()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_backend boolean := public.is_backend_role();
  v_admin boolean := v_backend or public.is_admin();
begin
  -- Deleting a reviewing admin runs ON DELETE SET NULL on reviewed_by. When a
  -- backend role does that and nothing else changes, let it through even for a
  -- request that is already final.
  if tg_op = 'UPDATE' and v_backend
     and old.reviewed_by is not null and new.reviewed_by is null
     and (to_jsonb(new) - 'reviewed_by') = (to_jsonb(old) - 'reviewed_by') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not v_admin then
      if new.profile_id is distinct from auth.uid() then
        raise exception 'You can only request a link for your own account' using errcode = '42501';
      end if;
      if new.status <> 'pending' or new.reviewed_by is not null or new.reviewed_at is not null then
        raise exception 'New requests must be pending' using errcode = '42501';
      end if;
      if exists (select 1 from public.profiles p where p.id = new.profile_id and p.person_id is not null) then
        raise exception 'This account is already linked to a person' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: identity columns never change.
  if new.id is distinct from old.id
     or new.profile_id is distinct from old.profile_id
     or new.created_at is distinct from old.created_at then
    raise exception 'link_requests identity columns are immutable' using errcode = '42501';
  end if;

  -- Approved / declined / cancelled are final.
  if old.status <> 'pending' then
    raise exception 'This request is already %', old.status using errcode = 'P0001';
  end if;

  if not v_admin then
    -- Members may only cancel their own pending request, nothing else.
    if new.status <> 'cancelled'
       or new.person_id is distinct from old.person_id
       or new.parents_note is distinct from old.parents_note
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Members can only cancel their own pending request' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Admin / backend: stamp the review.
  if new.status <> 'pending' then
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end; $$;

create or replace function public.guard_relative_suggestion()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_backend boolean := public.is_backend_role();
  v_admin boolean := v_backend or public.is_admin();
begin
  -- ON DELETE SET NULL on handled_by (a reviewing admin was deleted): allowed
  -- for a backend role even on a suggestion that is already final.
  if tg_op = 'UPDATE' and v_backend
     and old.handled_by is not null and new.handled_by is null
     and (to_jsonb(new) - 'handled_by') = (to_jsonb(old) - 'handled_by') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not v_admin then
      if new.suggested_by is distinct from auth.uid() then
        raise exception 'You can only suggest relatives for your own account' using errcode = '42501';
      end if;
      if new.status <> 'pending' or new.person_id is not null
         or new.handled_by is not null or new.handled_at is not null then
        raise exception 'New suggestions must be pending' using errcode = '42501';
      end if;
      -- Backstop for the rate limit in the server action: direct API calls
      -- cannot flood the admins either.
      if (select count(*) from public.relative_suggestions s
          where s.suggested_by = new.suggested_by
            and s.created_at > now() - interval '1 day') >= 10 then
        raise exception 'Too many suggestions today. Please try again tomorrow.'
          using errcode = 'P0001', hint = 'suggestion_limit';
      end if;
    end if;
    new.name := btrim(new.name);
    new.relation := btrim(new.relation);
    return new;
  end if;

  -- UPDATE: only an admin (or the backend) may change anything, and only the
  -- review fields of a pending suggestion.
  if not v_admin then
    raise exception 'Only an admin can review suggestions' using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.suggested_by is distinct from old.suggested_by
     or new.name is distinct from old.name
     or new.relation is distinct from old.relation
     or new.note is distinct from old.note
     or new.created_at is distinct from old.created_at then
    raise exception 'relative_suggestions content is immutable' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'This suggestion is already %', old.status using errcode = 'P0001';
  end if;
  if new.status <> 'pending' then
    new.handled_by := coalesce(auth.uid(), new.handled_by);
    new.handled_at := now();
  end if;
  return new;
end; $$;

-- ── Lows: owner's own profile ───────────────────────────────────────────────
create or replace function public.guard_profile_privileged_columns()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_backend    boolean := public.is_backend_role();
  v_super      boolean := public.is_super_admin();
  v_privileged boolean := v_backend or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if new.is_super_admin and not v_backend then
      raise exception 'Only the backend can create a super admin' using errcode = '42501';
    end if;
    if new.role = 'admin' and not (v_backend or v_super) then
      raise exception 'Only a super admin can create an admin' using errcode = '42501', hint = 'super_admin_required';
    end if;
    if not v_privileged and (
         new.role is distinct from 'viewer'
      or new.person_id is not null
      or new.approved_at is not null
      or new.approved_by is not null
      or new.onboarded_at is not null
      or new.checklist_dismissed_at is not null
    ) then
      raise exception 'Only an admin can set role, person_id or approval' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'profiles.id is immutable' using errcode = '42501';
    end if;

    -- The flag itself, and demoting a super admin: backend only.
    if new.is_super_admin is distinct from old.is_super_admin and not v_backend then
      raise exception 'Only the backend can change is_super_admin' using errcode = '42501';
    end if;
    if old.is_super_admin and new.role is distinct from old.role and not v_backend then
      raise exception 'A super admin cannot be demoted' using errcode = '42501', hint = 'super_admin_protected';
    end if;
    -- The owner's own details (link to the tree, name, birthday, email) can be
    -- changed by the owner or a backend role, not by another admin.
    if old.is_super_admin and not v_backend and auth.uid() is distinct from old.id and (
         new.person_id is distinct from old.person_id
      or new.display_name is distinct from old.display_name
      or new.full_name is distinct from old.full_name
      or new.date_of_birth is distinct from old.date_of_birth
      or new.email is distinct from old.email
    ) then
      raise exception 'Only the super admin can change their own profile' using errcode = '42501', hint = 'super_admin_protected';
    end if;
    -- Creating or removing an admin: super admin (or backend) only.
    if new.role is distinct from old.role
       and (new.role = 'admin' or old.role = 'admin')
       and not (v_backend or v_super) then
      raise exception 'Only a super admin can create or remove admins' using errcode = '42501', hint = 'super_admin_required';
    end if;

    if not v_privileged and (
         new.role is distinct from old.role
      or new.person_id is distinct from old.person_id
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
      or new.onboarded_at is distinct from old.onboarded_at
      or new.checklist_dismissed_at is distinct from old.checklist_dismissed_at
    ) then
      raise exception 'Only an admin can change role, person_id or approval' using errcode = '42501';
    end if;

    if new.role = 'admin' and old.approved_at is not null and new.approved_at is null then
      raise exception 'Admins always have access' using errcode = 'P0001', hint = 'admin_access';
    end if;

    if new.approved_at is null then
      new.approved_by := null;
    elsif old.approved_at is null and new.approved_by is null then
      new.approved_by := auth.uid();
    end if;
  end if;

  if tg_op = 'DELETE' then
    -- Deleting an account is for the owner. (Deleting the auth user runs this as
    -- a backend role, so the cascade is allowed.)
    if not (v_backend or v_super) then
      raise exception 'Only a super admin can delete accounts' using errcode = '42501', hint = 'super_admin_required';
    end if;
    if old.is_super_admin and not v_backend then
      raise exception 'A super admin cannot be deleted' using errcode = '42501', hint = 'super_admin_protected';
    end if;
  end if;

  -- There is always at least one super admin, whoever asks.
  if old.is_super_admin and (tg_op = 'DELETE' or new.is_super_admin is not true) then
    perform pg_advisory_xact_lock(hashtext('profiles_last_super_admin'));
    if not exists (
      select 1 from public.profiles p where p.is_super_admin and p.id <> old.id
    ) then
      raise exception 'Cannot remove the last super admin'
        using errcode = 'P0001', hint = 'last_super_admin';
    end if;
  end if;

  -- There is always at least one admin (unchanged).
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

-- ── Low: no admin name for accounts that are not approved ───────────────────
create or replace function public.first_admin_name()
returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.is_approved() then (
      select nullif(btrim(p.full_name), '')
      from public.profiles p
      where p.role = 'admin'
      order by p.created_at, p.id
      limit 1
    )
    else 'the family admins'
  end;
$$;
revoke all on function public.first_admin_name() from public, anon;
grant execute on function public.first_admin_name() to authenticated;
