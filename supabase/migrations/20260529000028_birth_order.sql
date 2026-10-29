-- Birth order among siblings, set by hand (most people have no birth date yet).
--
-- people.birth_order: 1 = oldest. Null = not set, so the app falls back to
-- birth_date, then name. The tree lays siblings out left (oldest) to right
-- (youngest) in this order, each with their whole branch.
--
-- set_children_order(parent, children): one call writes the whole order for a
-- parent's children (1..n) and clears any manual sideways nudge on those
-- children and their partners, so the branches re-flow into the new order.
-- SECURITY INVOKER: the people_write_editor RLS policy still decides who may
-- write (approved editors and admins); the explicit role check only gives a
-- clear error instead of a silent no-op.

alter table public.people
  add column if not exists birth_order integer;

alter table public.people
  drop constraint if exists people_birth_order_range;
alter table public.people
  add constraint people_birth_order_range check (birth_order is null or birth_order between 1 and 1000);

comment on column public.people.birth_order is 'Position among siblings, 1 = oldest; null = unknown (fall back to birth_date)';

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
  if not (
    (select public.is_approved())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'editor'))
  ) then
    raise exception 'Only editors and admins can change the order.' using errcode = '42501';
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

revoke all on function public.set_children_order(uuid, uuid[]) from public, anon;
grant execute on function public.set_children_order(uuid, uuid[]) to authenticated;
