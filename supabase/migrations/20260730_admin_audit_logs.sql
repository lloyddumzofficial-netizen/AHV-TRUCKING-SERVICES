create table if not exists public.admin_audit_logs (
  id uuid primary key,
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text not null default '',
  inquiry_reference text,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs
  drop constraint if exists admin_audit_logs_inquiry_reference_fkey;

create index if not exists idx_admin_audit_logs_inquiry_reference
  on public.admin_audit_logs(inquiry_reference);

create index if not exists idx_admin_audit_logs_admin_user_id
  on public.admin_audit_logs(admin_user_id);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs(created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "Admins can read audit logs" on public.admin_audit_logs;
create policy "Admins can read audit logs"
  on public.admin_audit_logs for select
  using (public.is_admin());

drop policy if exists "Admins can insert audit logs" on public.admin_audit_logs;
create policy "Admins can insert audit logs"
  on public.admin_audit_logs for insert
  with check (public.is_admin());

alter table public.admin_audit_logs replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_audit_logs'
  ) then
    alter publication supabase_realtime add table public.admin_audit_logs;
  end if;
end $$;
