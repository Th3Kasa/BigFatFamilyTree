-- Member accounts, part 3: "this is me" requests.
--
-- A new member searches the tree and asks to be linked to a person (or says
-- they are not in the tree yet). An admin reviews the request; approving it
-- sets profiles.person_id.

do $$ begin
  create type link_request_status as enum ('pending', 'approved', 'declined', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.link_requests (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  -- null = "I'm not in the tree yet". On approval it records who they were linked to.
  person_id    uuid references public.people(id) on delete set null,
  parents_note text check (parents_note is null or char_length(parents_note) <= 500),
  status       link_request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz
);

-- One pending request per account.
create unique index if not exists link_requests_one_pending_per_profile
  on public.link_requests (profile_id) where status = 'pending';
create index if not exists link_requests_status_created_idx
  on public.link_requests (status, created_at);

-- State machine + column guard (mirrored in lib/members/rules.ts, which is
-- unit-tested). SECURITY DEFINER so it can read profiles regardless of RLS.
create or replace function public.guard_link_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := (auth.uid() is null) or public.is_admin();
begin
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

  -- Admin / service role: stamp the review.
  if new.status <> 'pending' then
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
    new.reviewed_at := now();
  end if;
  return new;
end; $$;

drop trigger if exists link_requests_guard on public.link_requests;
create trigger link_requests_guard
  before insert or update on public.link_requests
  for each row execute function public.guard_link_request();

drop trigger if exists link_requests_audit on public.link_requests;
create trigger link_requests_audit
  after insert or update or delete on public.link_requests
  for each row execute function public.log_audit();

alter table public.link_requests enable row level security;

-- Members: read their own requests.
create policy link_requests_select_own on public.link_requests
  for select using (profile_id = auth.uid());

-- Members: file a pending request for themselves.
create policy link_requests_insert_own on public.link_requests
  for insert with check (
    profile_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- Members: cancel their own pending request (and nothing else; the trigger
-- additionally freezes every other column).
create policy link_requests_cancel_own on public.link_requests
  for update
  using (profile_id = auth.uid() and status = 'pending')
  with check (profile_id = auth.uid() and status = 'cancelled');

-- Admins: everything.
create policy link_requests_admin_all on public.link_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- Which people already belong to an account? Lets the "find yourself" screen
-- grey out a person who is taken, without exposing other members' profiles.
create or replace function public.claimed_person_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select person_id from public.profiles where person_id is not null;
$$;
revoke all on function public.claimed_person_ids() from public, anon;
grant execute on function public.claimed_person_ids() to authenticated;
