-- TV app step 3 review (docs/SPEC.md §9 Routines): a TV a little behind (it reads every 30 seconds) can't overwrite a
-- step log already saved, say on my phone (only a deleted log, or Resume completing a skipped one, changes); steps of
-- a removed step or routine aren't logged; and a habit is completed only for a day its step's run covers.

create or replace function public.tv_save_routine_step(device_key text, runs jsonb, step_logs jsonb, habit_log jsonb default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  r jsonb;
  l jsonb;
begin
  me := public.tv_owner(device_key);
  if jsonb_typeof(runs) <> 'array' or jsonb_typeof(step_logs) <> 'array'
     or jsonb_array_length(runs) > 2 or jsonb_array_length(step_logs) > 100 then
    raise exception 'TV routine step not allowed' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(runs) loop
    if not exists (select 1 from public.routines x where x.id = (r->>'routine_id')::uuid and x.user_id = me and x.deleted_at is null) then
      raise exception 'TV routine step not allowed' using errcode = '42501';
    end if;
    insert into public.routine_runs (id, user_id, routine_id, date, started_at, finished_at)
    values ((r->>'id')::uuid, me, (r->>'routine_id')::uuid, (r->>'date')::date, (r->>'started_at')::timestamptz, (r->>'finished_at')::timestamptz)
    on conflict (id) do update set finished_at = coalesce(public.routine_runs.finished_at, excluded.finished_at)
      where public.routine_runs.user_id = me and public.routine_runs.routine_id = excluded.routine_id
        and public.routine_runs.deleted_at is null;
  end loop;

  for l in select * from jsonb_array_elements(step_logs) loop
    if (l->>'status') not in ('completed', 'skipped') or not exists (
      select 1 from public.routine_runs u
      join public.routine_steps s on s.routine_id = u.routine_id
      join public.routines x on x.id = u.routine_id
      where u.id = (l->>'run_id')::uuid and u.user_id = me and u.deleted_at is null
        and s.id = (l->>'step_id')::uuid and s.user_id = me and s.deleted_at is null and x.deleted_at is null) then
      raise exception 'TV routine step not allowed' using errcode = '42501';
    end if;
    insert into public.routine_step_logs (id, user_id, run_id, step_id, status, logged_at)
    values ((l->>'id')::uuid, me, (l->>'run_id')::uuid, (l->>'step_id')::uuid, (l->>'status')::public.routine_step_status, (l->>'logged_at')::timestamptz)
    -- A log already saved (on my phone, say) stays, unless it was deleted or Resume completes a skipped step.
    on conflict (id) do update set status = excluded.status, logged_at = excluded.logged_at, deleted_at = null
      where public.routine_step_logs.user_id = me and public.routine_step_logs.run_id = excluded.run_id
        and public.routine_step_logs.step_id = excluded.step_id
        and (public.routine_step_logs.deleted_at is not null
          or (public.routine_step_logs.status = 'skipped' and excluded.status = 'completed'));
  end loop;

  if habit_log is not null then
    if not exists (
      select 1 from jsonb_array_elements(step_logs) x
      join public.routine_steps s on s.id = (x->>'step_id')::uuid and s.user_id = me
      join public.habits h on h.id = s.habit_id and h.user_id = me and h.deleted_at is null
      join public.routine_runs u on u.id = (x->>'run_id')::uuid and u.user_id = me
      where x->>'status' = 'completed' and h.id = (habit_log->>'habit_id')::uuid
        -- From the run's day (a run-anytime run carries over days) to today, with a day's slack for time zones.
        and (habit_log->>'date')::date between u.date and current_date + 1) then
      raise exception 'TV routine step not allowed' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.habit_logs h
      where h.habit_id = (habit_log->>'habit_id')::uuid and h.date = (habit_log->>'date')::date and h.deleted_at is null) then
      insert into public.habit_logs (id, user_id, habit_id, date, status, completed_at)
      values ((habit_log->>'id')::uuid, me, (habit_log->>'habit_id')::uuid, (habit_log->>'date')::date, 'completed', (habit_log->>'completed_at')::timestamptz)
      on conflict (id) do update set status = 'completed', completed_at = excluded.completed_at, deleted_at = null
        where public.habit_logs.user_id = me and public.habit_logs.habit_id = excluded.habit_id;
    end if;
  end if;
end;
$$;
