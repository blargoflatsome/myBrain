-- TV app step 2 (docs/SPEC.md §9 The dashboard, What it reads): one call that returns what the TV shows (the Monthly
-- calendar's weeks and Your Day) and what Up next needs, and nothing more: no notes, places or guest lists, no Orphans'
-- text and no journal writing. Habit logs come in full on the first call and then only the ones changed since.
create function public.tv_snapshot(device_key text, from_date date, to_date date, today date, logs_since timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
begin
  -- An unpaired key raises 28000, so the TV goes back to pairing.
  me := public.tv_owner(device_key);
  -- The calendar shows at most six weeks; "today" may sit just outside them while I look at another month.
  if from_date is null or to_date is null or today is null or to_date < from_date or to_date - from_date > 42
     or abs(today - from_date) > 400 then
    raise exception 'TV snapshot range not allowed' using errcode = '22023';
  end if;
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
          or (t.status = 'open' and t.due_date < today)
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
    'routine_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'routine_id', u.routine_id, 'date', u.date, 'started_at', u.started_at,
        'finished_at', u.finished_at, 'deleted_at', null))
      from public.routine_runs u where u.user_id = me and u.deleted_at is null and u.date = today), '[]'::jsonb),
    'orphans', (select count(*) from public.inbox o where o.user_id = me and o.deleted_at is null),
    'wrote_today', exists (
      select 1 from public.journal_entries j
      where j.user_id = me and j.date = today and not j.auto and j.has_writing and j.deleted_at is null),
    'journal_time', (select p.evening_reminder_time from public.profiles p where p.user_id = me)
  );
end;
$$;
revoke all on function public.tv_snapshot(text, date, date, date, timestamptz) from public;
grant execute on function public.tv_snapshot(text, date, date, date, timestamptz) to anon, authenticated;
