create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  table_name text not null,
  row_id uuid,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

-- Only admins can read. Never writable directly from the client; written by triggers.
create policy audit_log_admin_select on public.audit_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
