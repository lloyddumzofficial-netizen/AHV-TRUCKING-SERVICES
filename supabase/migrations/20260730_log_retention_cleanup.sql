-- Keep operational logs lightweight.
--
-- Notifications are derived from inquiry_status_history, so keeping only the
-- latest 3 days prevents the customer/admin views from getting slower over
-- time without adding a separate notifications table.

create or replace function public.cleanup_old_operational_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.admin_audit_logs
   where created_at < now() - interval '3 days';

  delete from public.inquiry_status_history
   where created_at < now() - interval '3 days';
end;
$$;

comment on function public.cleanup_old_operational_logs() is
  'Deletes admin audit logs and customer notification history older than 3 days.';

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'ahv-cleanup-operational-logs-daily';

    perform cron.schedule(
      'ahv-cleanup-operational-logs-daily',
      '15 19 * * *',
      'select public.cleanup_old_operational_logs();'
    );
  else
    raise notice 'pg_cron is not enabled; run select public.cleanup_old_operational_logs(); from a scheduled job.';
  end if;
exception
  when insufficient_privilege or undefined_schema or undefined_table then
    raise notice 'Could not schedule pg_cron cleanup; run select public.cleanup_old_operational_logs(); from a scheduled job.';
end $$;
