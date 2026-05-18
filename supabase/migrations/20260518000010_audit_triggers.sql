create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, table_name, row_id, operation, before, after)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end; $$;

create trigger people_audit
  after insert or update or delete on public.people
  for each row execute function public.log_audit();

create trigger events_audit
  after insert or update or delete on public.events
  for each row execute function public.log_audit();

create trigger relationships_audit
  after insert or update or delete on public.relationships
  for each row execute function public.log_audit();
