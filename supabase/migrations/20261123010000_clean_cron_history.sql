-- Scheduled-job history (SPEC §6): pg_cron writes a row to cron.job_run_details for every run and never removes
-- them (about 4,000 rows a day from the once-a-minute jobs). Keep 7 days for troubleshooting; clear the rest daily.
create or replace function public.clean_cron_history(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from cron.job_run_details where start_time < at - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.clean_cron_history(timestamptz) from public, anon, authenticated;

select cron.schedule('my-brain-clean-cron-history', '30 3 * * *', 'select public.clean_cron_history()');
