-- TV app step 3, Routines (docs/SPEC.md §9): the TV runs my routines with every §5 Routines rule, as the same run as on
-- my phone. tv_snapshot now also returns my routines' steps, the runs a run-anytime routine carries over days (its
-- latest open run and latest finished one), and those runs' step logs. tv_save_routine_step is the one write: the
-- rows the shared routine rules worked out for a Skip or Completed press, checked here to be mine and to fit together.

create or replace function public.tv_snapshot(device_key text, from_date date, to_date date, today date, logs_since timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  run_ids uuid[];
begin
  -- An unpaired key raises 28000, so the TV goes back to pairing.
  me := public.tv_owner(device_key);
  -- The calendar shows at most six weeks; today may be far from them while I look at another month.
  if from_date is null or to_date is null or today is null or to_date < from_date or to_date - from_date > 42 then
    raise exception 'TV snapshot range not allowed' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct y.id), '{}') into run_ids from (
    select u.id from public.routine_runs u where u.user_id = me and u.deleted_at is null and u.date = today
    union
    select x.id from public.routines r
    cross join lateral (
      (select u.id from public.routine_runs u
        where u.routine_id = r.id and u.user_id = me and u.deleted_at is null and u.finished_at is null
        order by u.started_at desc limit 1)
      union all
      (select u.id from public.routine_runs u
        where u.routine_id = r.id and u.user_id = me and u.deleted_at is null and u.finished_at is not null
        order by u.finished_at desc limit 1)) x
    where r.user_id = me and r.deleted_at is null and r.weekdays is null) y;
  return jsonb_build_object(
    'me', me,
    'now', now(),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'due_date', t.due_date, 'priority', t.priority, 'status', t.status,
        'completed_at', t.completed_at, 'cleared_at', t.cleared_at, 'reminder_time', t.reminder_time,
        'source', t.source, 'created_at', t.created_at, 'deleted_at', null))
      from public.tasks t
      where t.user_id = me and t.deleted_at is null and t.status <> 'cancelled' and t.due_date is not null
        and ((t.due_date between from_date and to_date)
          or (t.status = 'open' and t.due_date <= today)
          or (t.status = 'done' and t.completed_at >= today - 1))), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'user_id', e.user_id, 'title', e.title, 'start_date', e.start_date, 'start_time', e.start_time,
        'end_date', e.end_date, 'end_time', e.end_time, 'repeat', e.repeat, 'reminder_minutes', null,
        'cancelled_at', e.cancelled_at, 'deleted_at', null))
      from public.events e
      where e.deleted_at is null and e.start_date <= greatest(to_date, today)
        and (e.repeat <> 'never' or e.end_date >= least(from_date, today))
        and (e.user_id = me or exists (
          select 1 from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
          where i.event_id = e.id and r.user_id = me and i.deleted_at is null))), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'event_id', i.event_id, 'response', i.response, 'deleted_at', null))
      from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
      where r.user_id = me and i.deleted_at is null), '[]'::jsonb),
    'habits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'title', h.title, 'notify_time', h.notify_time, 'timer_minutes', h.timer_minutes,
        'weekdays', h.weekdays, 'start_date', h.start_date, 'is_priority', h.is_priority,
        'week_interval', h.week_interval, 'monthly', h.monthly, 'created_at', h.created_at, 'deleted_at', null))
      from public.habits h where h.user_id = me and h.deleted_at is null), '[]'::jsonb),
    -- With logs_since, deleted logs come too, so the TV can drop its copy.
    'habit_logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'habit_id', l.habit_id, 'date', l.date, 'status', l.status, 'completed_at', l.completed_at,
        'updated_at', l.updated_at, 'deleted_at', l.deleted_at))
      from public.habit_logs l
      where l.user_id = me
        and (case when logs_since is null then l.deleted_at is null else l.updated_at > logs_since end)), '[]'::jsonb),
    'habit_pauses', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'start_date', p.start_date, 'end_date', p.end_date, 'deleted_at', null))
      from public.habit_pauses p where p.user_id = me and p.deleted_at is null), '[]'::jsonb),
    'routines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'notify_time', r.notify_time, 'weekdays', r.weekdays, 'start_date', r.start_date,
        'week_interval', r.week_interval, 'deleted_at', null))
      from public.routines r where r.user_id = me and r.deleted_at is null), '[]'::jsonb),
    -- Today's runs; a run-anytime routine carries over days, so also its latest open run and its latest finished one
    -- (Resume goes back to its skips).
    'routine_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'routine_id', u.routine_id, 'date', u.date, 'started_at', u.started_at,
        'finished_at', u.finished_at, 'deleted_at', null))
      from public.routine_runs u where u.id = any(run_ids)), '[]'::jsonb),
    'routine_steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'routine_id', s.routine_id, 'position', s.position, 'title', s.title, 'habit_id', s.habit_id,
        'start_date', s.start_date, 'deleted_at', null))
      from public.routine_steps s join public.routines r on r.id = s.routine_id
      where s.user_id = me and s.deleted_at is null and r.deleted_at is null), '[]'::jsonb),
    'routine_step_logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'run_id', l.run_id, 'step_id', l.step_id, 'status', l.status, 'logged_at', l.logged_at, 'deleted_at', null))
      from public.routine_step_logs l
      where l.user_id = me and l.deleted_at is null and l.run_id = any(run_ids)), '[]'::jsonb),
    'orphans', (select count(*) from public.inbox o where o.user_id = me and o.deleted_at is null),
    'wrote_today', exists (
      select 1 from public.journal_entries j
      where j.user_id = me and j.date = today and not j.auto and j.has_writing and j.deleted_at is null),
    'journal_time', (select p.evening_reminder_time from public.profiles p where p.user_id = me)
  );
end;
$$;

-- Skip or Completed on the TV (SPEC §9 Routines): a run to start or finish, the step logs to save, and, for a habit
-- step completed, the habit's log for that day. Everything must be mine; a step log must be for a step of its run's
-- routine; the habit must be the one a completed step is linked to. A habit already logged that day is left alone.
create function public.tv_save_routine_step(device_key text, runs jsonb, step_logs jsonb, habit_log jsonb default null)
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
      select 1 from public.routine_runs u join public.routine_steps s on s.routine_id = u.routine_id
      where u.id = (l->>'run_id')::uuid and u.user_id = me and u.deleted_at is null
        and s.id = (l->>'step_id')::uuid and s.user_id = me) then
      raise exception 'TV routine step not allowed' using errcode = '42501';
    end if;
    insert into public.routine_step_logs (id, user_id, run_id, step_id, status, logged_at)
    values ((l->>'id')::uuid, me, (l->>'run_id')::uuid, (l->>'step_id')::uuid, (l->>'status')::public.routine_step_status, (l->>'logged_at')::timestamptz)
    on conflict (id) do update set status = excluded.status, logged_at = excluded.logged_at, deleted_at = null
      where public.routine_step_logs.user_id = me and public.routine_step_logs.run_id = excluded.run_id
        and public.routine_step_logs.step_id = excluded.step_id;
  end loop;

  if habit_log is not null then
    if not exists (
      select 1 from jsonb_array_elements(step_logs) x
      join public.routine_steps s on s.id = (x->>'step_id')::uuid and s.user_id = me
      join public.habits h on h.id = s.habit_id and h.user_id = me and h.deleted_at is null
      where x->>'status' = 'completed' and h.id = (habit_log->>'habit_id')::uuid) then
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
revoke all on function public.tv_save_routine_step(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.tv_save_routine_step(text, jsonb, jsonb, jsonb) to anon, authenticated;
