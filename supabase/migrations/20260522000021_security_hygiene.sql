-- Security hygiene from the Supabase advisor.
--
--  * Trigger-only functions are not RPC endpoints: nobody should be able to
--    call them through PostgREST. (A trigger fires without checking EXECUTE on
--    its function; that privilege is only checked when the trigger is created.)
--  * anon cannot execute the SECURITY DEFINER helpers that RLS uses.
--  * set_updated_at() gets a fixed search_path.
--  * The person_groups materialized view cannot have RLS, so no client role may
--    read it. The app never queries it; it only exists for the refresh trigger.

-- ── trigger-only functions ──────────────────────────────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_audit() from public, anon, authenticated;
revoke execute on function public.log_audit_profiles() from public, anon, authenticated;
revoke execute on function public.guard_profile_privileged_columns() from public, anon, authenticated;
revoke execute on function public.guard_link_request() from public, anon, authenticated;
revoke execute on function public.guard_relative_suggestion() from public, anon, authenticated;
revoke execute on function public.refresh_person_groups() from public, anon, authenticated;

-- Supabase's own event-trigger helper exists in the hosted project but not in
-- these migration files, so only touch it where it exists.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- ── helpers that RLS calls: signed-in users only ────────────────────────────
-- Policies call these as the querying role, so authenticated keeps EXECUTE.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

revoke execute on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated, service_role;

-- Called by the invoker guard triggers, so authenticated must keep it.
revoke execute on function public.is_backend_role() from public, anon;
grant execute on function public.is_backend_role() to authenticated, service_role;

-- Deleting an auth user cascades to profiles as supabase_auth_admin, and the
-- invoker guard triggers evaluate is_backend_role() and is_admin() as that
-- role. Revoking from PUBLIC must not take their EXECUTE away.
do $$
declare r text;
begin
  foreach r in array array['supabase_auth_admin', 'supabase_admin'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.is_admin() to %I', r);
      execute format('grant execute on function public.is_backend_role() to %I', r);
    end if;
  end loop;
end $$;

-- Internal search helpers: only the SECURITY DEFINER RPCs (same owner) use them.
revoke execute on function public._claim_norm(text) from public, anon, authenticated;

-- ── set_updated_at: pin the search_path ─────────────────────────────────────
alter function public.set_updated_at() set search_path = '';

-- ── person_groups: no client access ─────────────────────────────────────────
revoke all on public.person_groups from public, anon, authenticated;
