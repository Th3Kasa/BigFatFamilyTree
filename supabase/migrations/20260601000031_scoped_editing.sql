-- Family-scoped editing.
--
-- Editors may change only their own close family: the person their account is
-- linked to (profiles.person_id), their spouse(s) (not ex-spouses), siblings,
-- children, grandchildren, parents and grandparents, plus anyone they added
-- themselves (until another member's account is linked to that card).
-- Admins (and the backend) keep full control. Viewers still cannot edit.
--
--  * people.created_by: who added the row (defaults to the caller).
--  * family_scope(person) / can_edit_person(target): the rule, in one place.
--  * people:  INSERT by approved editors/admins; UPDATE only rows in scope;
--             DELETE admins only.
--  * guard_people_scope(): non-admins may soft-delete only unclaimed people they
--             added, may not change created_by,
--             or set a parent link that would pull new people into their scope
--             (re-parenting themselves or their parents onto someone else's line).
--  * relationships: both people must be editable.
--  * events: the person must be editable.
--  * set_children_order: the parent must be editable.

-- ── who added a person ──────────────────────────────────────────────────────
alter table public.people
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
comment on column public.people.created_by is
  'The account that added this person. Editors may always edit people they added.';
create index if not exists people_created_by_idx on public.people (created_by) where created_by is not null;

-- ── the scope ───────────────────────────────────────────────────────────────
-- Everyone a person may edit when it is their own linked card: self, spouses,
-- parents, grandparents, children, grandchildren and siblings (sharing either
-- parent). Deleted people are never part of it.
create or replace function public.family_scope(p_me uuid)
returns table (id uuid)
language sql stable security definer set search_path = public as $$
  with me as (
    select pe.id, pe.father_id, pe.mother_id from public.people pe
    where pe.id = p_me and pe.deleted_at is null
  ),
  parents as (
    select pe.id, pe.father_id, pe.mother_id from public.people pe, me
    where pe.deleted_at is null and pe.id in (me.father_id, me.mother_id)
  ),
  grandparents as (
    select pe.id from public.people pe
    where pe.deleted_at is null
      and pe.id in (select father_id from parents union select mother_id from parents)
  ),
  children as (
    select pe.id from public.people pe
    where pe.deleted_at is null and (pe.father_id = p_me or pe.mother_id = p_me)
  ),
  grandchildren as (
    select pe.id from public.people pe
    where pe.deleted_at is null
      and (pe.father_id in (select id from children) or pe.mother_id in (select id from children))
  ),
  siblings as (
    select pe.id from public.people pe, me
    where pe.deleted_at is null and pe.id <> me.id
      and ((me.father_id is not null and pe.father_id = me.father_id)
        or (me.mother_id is not null and pe.mother_id = me.mother_id))
  ),
  spouses as (
    select case when r.person_a_id = p_me then r.person_b_id else r.person_a_id end as id
    from public.relationships r
    where r.type = 'spouse' and coalesce(r.status, 'current') <> 'divorced'
      and (r.person_a_id = p_me or r.person_b_id = p_me)
  )
  select id from me
  union select id from parents
  union select id from grandparents
  union select id from children
  union select id from grandchildren
  union select id from siblings
  union select s.id from spouses s join public.people pe on pe.id = s.id and pe.deleted_at is null;
$$;

-- May the caller edit this person? Admins: yes. Approved editors: their family
-- scope, plus people they added. Everyone else: no.
create or replace function public.can_edit_person(p_target uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_role   public.user_role;
  v_me     uuid;
  v_ok     boolean;
begin
  if p_target is null or auth.uid() is null then
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;
  if not public.is_approved() then
    return false;
  end if;
  select p.role, p.person_id into v_role, v_me from public.profiles p where p.id = auth.uid();
  if v_role is distinct from 'editor' then
    return false;
  end if;
  -- People they added, until another member's account is linked to that card.
  if exists (select 1 from public.people pe
             where pe.id = p_target and pe.created_by = auth.uid() and pe.deleted_at is null
               and not exists (select 1 from public.profiles pr where pr.person_id = pe.id and pr.id <> auth.uid())) then
    return true;
  end if;
  if v_me is null then
    return false;
  end if;
  select exists (select 1 from public.family_scope(v_me) s where s.id = p_target) into v_ok;
  return v_ok;
end;
$$;

-- Every person the caller may edit (null = everyone, for admins). The app uses
-- this to show edit buttons only where they will work.
create or replace function public.my_editable_person_ids()
returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_role public.user_role;
  v_me   uuid;
begin
  if auth.uid() is null then
    return array[]::uuid[];
  end if;
  if public.is_admin() then
    return null;
  end if;
  select p.role, p.person_id into v_role, v_me from public.profiles p where p.id = auth.uid();
  if not public.is_approved() or v_role is distinct from 'editor' then
    return array[]::uuid[];
  end if;
  return coalesce((
    select array_agg(distinct x.id) from (
      select s.id from public.family_scope(v_me) s where v_me is not null
      union
      select pe.id from public.people pe
      where pe.created_by = auth.uid() and pe.deleted_at is null
        and not exists (select 1 from public.profiles pr where pr.person_id = pe.id and pr.id <> auth.uid())
    ) x
  ), array[]::uuid[]);
end;
$$;

revoke execute on function public.family_scope(uuid) from public, anon;
revoke execute on function public.can_edit_person(uuid) from public, anon;
revoke execute on function public.my_editable_person_ids() from public, anon;
-- family_scope reveals family links, so only the two definer functions (which
-- run as the owner) call it; members never call it directly.
revoke execute on function public.family_scope(uuid) from authenticated;
grant execute on function public.can_edit_person(uuid) to authenticated;
grant execute on function public.my_editable_person_ids() to authenticated;

-- ── people ──────────────────────────────────────────────────────────────────
drop policy if exists people_write_editor on public.people;
drop policy if exists people_insert_editor on public.people;
drop policy if exists people_update_scoped on public.people;
drop policy if exists people_delete_admin on public.people;

create policy people_insert_editor on public.people
  for insert with check (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

create policy people_update_scoped on public.people
  for update using (public.can_edit_person(id)) with check (public.can_edit_person(id));

create policy people_delete_admin on public.people
  for delete using (public.is_admin());

-- Non-admin rules that RLS alone cannot express.
create or replace function public.guard_people_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  v_me  uuid;
  v_new uuid;
  v_old uuid;
  v_col text;
begin
  if public.is_backend_role() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The adder is always the caller.
    new.created_by := auth.uid();
    if new.deleted_at is not null then
      raise exception 'New people cannot start deleted' using errcode = '42501';
    end if;
  else
    if new.created_by is distinct from old.created_by then
      raise exception 'Only an admin can change who added a person' using errcode = '42501';
    end if;
    -- Editors may delete only people they added themselves, and never a card
    -- that a member's account is linked to.
    if new.deleted_at is distinct from old.deleted_at
       and (old.created_by is distinct from auth.uid()
            or exists (select 1 from public.profiles pr where pr.person_id = old.id)) then
      raise exception 'Only an admin can delete this person' using errcode = '42501', hint = 'admin_only_delete';
    end if;
  end if;

  select p.person_id into v_me from public.profiles p where p.id = auth.uid();

  foreach v_col in array array['father_id', 'mother_id'] loop
    if v_col = 'father_id' then
      v_new := new.father_id;
      v_old := case when tg_op = 'UPDATE' then old.father_id end;
    else
      v_new := new.mother_id;
      v_old := case when tg_op = 'UPDATE' then old.mother_id end;
    end if;

    if v_new is null or v_new is not distinct from v_old then
      continue;  -- unlinking, or unchanged
    end if;

    -- The new parent must be someone the caller may edit (checked before the change).
    if not public.can_edit_person(v_new) then
      raise exception 'You can only link people in your own close family. Ask an admin for this one.'
        using errcode = '42501', hint = 'out_of_scope_link';
    end if;

    -- Re-parenting the caller's own card changes who their siblings (the new
    -- parent's children) and grandparents (the new parent's parents) are. Allowed
    -- only if all of those are editable already, so nobody new enters the scope,
    -- whoever added the card. (A parent's own parents only decide the caller's
    -- grandparents, and the new one must be editable already: nothing to add.)
    if tg_op = 'UPDATE'
       and v_me is not null
       and new.id = v_me
       and (
         exists (select 1 from public.people c
                 where c.deleted_at is null and c.id <> v_me
                   and (c.father_id = v_new or c.mother_id = v_new)
                   and not public.can_edit_person(c.id))
         or exists (select 1 from public.people pp
                    where pp.id = v_new
                      and ((pp.father_id is not null and not public.can_edit_person(pp.father_id))
                        or (pp.mother_id is not null and not public.can_edit_person(pp.mother_id))))
       )
    then
      raise exception 'Only an admin can link you to this parent, as their family is outside yours.'
        using errcode = '42501', hint = 'out_of_scope_link';
    end if;

    -- Making an existing person the caller's child turns that person's children
    -- into the caller's grandchildren: allowed only if they are all editable already.
    if tg_op = 'UPDATE'
       and v_me is not null
       and v_new = v_me
       and exists (select 1 from public.people c
                   where c.deleted_at is null
                     and (c.father_id = new.id or c.mother_id = new.id)
                     and not public.can_edit_person(c.id))
    then
      raise exception 'Only an admin can link this person as your child, as their family is outside yours.'
        using errcode = '42501', hint = 'out_of_scope_link';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists people_guard_scope on public.people;
create trigger people_guard_scope
  before insert or update on public.people
  for each row execute function public.guard_people_scope();

-- ── relationships ───────────────────────────────────────────────────────────
drop policy if exists relationships_write_editor on public.relationships;
drop policy if exists relationships_write_scoped on public.relationships;
create policy relationships_write_scoped on public.relationships
  for all
  using (public.can_edit_person(person_a_id) and public.can_edit_person(person_b_id))
  with check (public.can_edit_person(person_a_id) and public.can_edit_person(person_b_id));

-- ── events ──────────────────────────────────────────────────────────────────
-- Life events follow the person's scope. Memories (notable_story) stay open to
-- every approved editor/admin on any page, as before.
drop policy if exists events_write_editor on public.events;
drop policy if exists events_write_scoped on public.events;
drop policy if exists events_write_memory_editor on public.events;
create policy events_write_scoped on public.events
  for all
  using (public.can_edit_person(person_id))
  with check (public.can_edit_person(person_id));
create policy events_write_memory_editor on public.events
  for all
  using (
    type = 'notable_story'
    and (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  )
  with check (
    type = 'notable_story'
    and (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  );

-- ── birth order ─────────────────────────────────────────────────────────────
create or replace function public.set_children_order(p_parent uuid, p_children uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int := coalesce(array_length(p_children, 1), 0);
  matched int;
begin
  if not public.can_edit_person(p_parent) then
    raise exception 'You can only change the order in your own close family.' using errcode = '42501';
  end if;

  if n < 1 or n > 1000 then
    raise exception 'Invalid list of children.' using errcode = '22023';
  end if;
  if (select count(distinct c) from unnest(p_children) c) <> n then
    raise exception 'A child appears twice in the list.' using errcode = '22023';
  end if;

  select count(*) into matched
  from public.people
  where id = any(p_children)
    and deleted_at is null
    and (father_id = p_parent or mother_id = p_parent);
  if matched <> n then
    raise exception 'Every person in the list must be a child of this parent.' using errcode = '22023';
  end if;
  -- RLS would skip rows the caller may not edit; refuse instead of saving half an order.
  if exists (select 1 from unnest(p_children) c where not public.can_edit_person(c)) then
    raise exception 'You can only change the order in your own close family.' using errcode = '42501';
  end if;

  update public.people pe
  set birth_order = o.ord
  from unnest(p_children) with ordinality as o(id, ord)
  where pe.id = o.id
    and pe.birth_order is distinct from o.ord::int;

  -- Manual nudges (pos_x offset, pos_y null) would hold a branch in its old
  -- place; clear them on the children and their partners so the tree re-flows.
  update public.people pe
  set pos_x = null
  where pe.pos_x is not null
    and pe.pos_y is null
    and (
      pe.id = any(p_children)
      or pe.id in (
        select case when r.person_a_id = any(p_children) then r.person_b_id else r.person_a_id end
        from public.relationships r
        where r.type = 'spouse'
          and (r.person_a_id = any(p_children) or r.person_b_id = any(p_children))
      )
    );
end;
$$;

-- ── storage: profile photos ─────────────────────────────────────────────────
-- Profile photos live at <personId>/<file> (new person forms upload <file> at
-- the root before the person exists). Editors may upload into a person's folder
-- only if they may edit that person; deleting needs the same (root files: admins).
drop policy if exists "photos_editor_insert" on storage.objects;
create policy "photos_editor_insert" on storage.objects
  for insert with check (
    bucket_id = 'photos'
    and (select public.is_approved())
    and exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'editor'))
    and (
      coalesce(array_length(storage.foldername(name), 1), 0) = 0
      or case
           when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then public.can_edit_person(((storage.foldername(name))[1])::uuid)
           else false
         end
    )
  );

drop policy if exists "photos_editor_delete" on storage.objects;
create policy "photos_editor_delete" on storage.objects
  for delete using (
    bucket_id = 'photos'
    and (select public.is_approved())
    and (
      public.is_admin()
      or case
           when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then public.can_edit_person(((storage.foldername(name))[1])::uuid)
           else false
         end
    )
  );

-- ── deleting a person ───────────────────────────────────────────────────────
-- One call that checks permission FIRST, then clears the parent links pointing
-- at the person and soft-deletes them, all in one transaction (so a refused
-- delete never leaves links half-cleared). Admins: anyone. Editors: only an
-- unclaimed person they added themselves.
create or replace function public.delete_person(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Please sign in first' using errcode = '42501';
  end if;
  if not public.is_admin() and not exists (
    select 1 from public.people pe
    join public.profiles me on me.id = auth.uid() and me.role = 'editor'
    where pe.id = p_id
      and pe.deleted_at is null
      and pe.created_by = auth.uid()
      and not exists (select 1 from public.profiles pr where pr.person_id = pe.id)
  ) then
    raise exception 'Only an admin can delete this person' using errcode = '42501', hint = 'admin_only_delete';
  end if;
  -- This function skips RLS when it clears links, so an editor may only delete a
  -- person whose children are all in their own scope (can_edit_person still sees
  -- the caller's auth.uid() here).
  if not public.is_admin() and exists (
    select 1 from public.people c
    where c.deleted_at is null and (c.father_id = p_id or c.mother_id = p_id)
      and not public.can_edit_person(c.id)
  ) then
    raise exception 'Only an admin can delete this person, as some of their children are outside your family.'
      using errcode = '42501', hint = 'admin_only_delete';
  end if;

  update public.people set father_id = null where father_id = p_id and deleted_at is null;
  update public.people set mother_id = null where mother_id = p_id and deleted_at is null;
  update public.people set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then
    raise exception 'That person is no longer in the tree' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.delete_person(uuid) from public, anon;
grant execute on function public.delete_person(uuid) to authenticated;
