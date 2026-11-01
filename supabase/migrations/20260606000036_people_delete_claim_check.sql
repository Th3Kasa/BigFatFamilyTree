-- Editors could hide a relative's card that a member's account is linked to.
--
-- guard_people_scope (migration 31) refuses a non-admin's soft delete of a
-- linked card, but it looked the link up in public.profiles under the caller's
-- own RLS, where editors only ever see their own profile row. So the check was
-- always false for anyone else's card, and an editor could set deleted_at on a
-- relative's linked card they had added (PATCH /rest/v1/people) and skip
-- delete_person(). The lookup now goes through claimed_person_ids(), which is
-- SECURITY DEFINER. Nothing else in the function changes.

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
            -- claimed_person_ids() is SECURITY DEFINER: this trigger runs as the
            -- caller, and profiles RLS hides other members' rows from editors.
            or old.id in (select public.claimed_person_ids())) then
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
