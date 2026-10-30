-- Tighten migration 32: member_display_name(p_user) was callable by any
-- signed-in member for any account id (Supabase advisor 0029). It is only
-- needed by the posts/comments insert trigger, so the trigger now runs as its
-- owner (SECURITY DEFINER, which a trigger function can't be called through
-- the API anyway) and nobody can call the name lookup directly.

create or replace function public.stamp_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    new.author_name := coalesce(public.member_display_name(auth.uid()), 'A family member');
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_author() from public, anon, authenticated;

revoke all on function public.member_display_name(uuid) from public, anon, authenticated;
