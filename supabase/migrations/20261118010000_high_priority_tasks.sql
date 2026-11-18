-- Priority tasks merged into tasks (docs/SPEC.md §5 High-priority tasks and priority habits, 2026-11-18, user): a
-- High task is a priority task. It can have a reminder time (with a date), which brings the full-screen reminder on
-- its day and each later day while it carries over. Priority tasks are removed (no users yet, so nothing is moved).

alter table public.tasks add column reminder_time time;
alter table public.tasks add constraint tasks_reminder_high_dated
  check (reminder_time is null or (priority = 3 and due_date is not null));

delete from public.reminder_state where kind = 'priority_task';
alter table public.reminder_state drop constraint if exists reminder_state_kind_check;
alter table public.reminder_state add constraint reminder_state_kind_check
  check (kind in ('habit', 'routine', 'task', 'evening', 'event'));

create or replace function public.due_reminders(at timestamptz default now())
returns table (
  user_id uuid,
  kind text,
  item_id uuid,
  title text,
  is_priority boolean,
  local_date date,
  url text,
  detail text
)
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select p.user_id,
           p.timezone,
           (at at time zone p.timezone)::date as d,
           (at at time zone p.timezone)::time as t,
           p.quiet_hours_start as qs,
           p.quiet_hours_end as qe,
           p.quiet_hours_silence_priority as silence_priority,
           p.evening_reminder_time as evening_time,
           (at at time zone p.timezone)::timestamp as now_local
    from public.profiles p
    where p.deleted_at is null
  ),
  people_q as (
    select *,
           case
             when qs is null or qe is null then false
             when qs <= qe then t >= qs and t < qe
             else t >= qs or t < qe
           end as in_quiet
    from people
  ),
  candidates as (
    select h.user_id, 'habit'::text as kind, h.id as item_id, h.title, h.is_priority, pq.d as local_date,
           '/habits'::text as url, null::text as detail, pq.in_quiet, pq.silence_priority
    from public.habits h
    join people_q pq on pq.user_id = h.user_id
    where h.deleted_at is null
      and h.notify_time is not null
      and pq.t >= h.notify_time
      and public.habit_on(h.start_date, h.weekdays, h.week_interval, h.monthly, pq.d)
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = h.id and l.date = pq.d and l.deleted_at is null and l.status = 'completed'
      )
      -- Pause all streaks (SPEC §5 Habits): no habit reminders on paused days.
      and not exists (
        select 1 from public.habit_pauses hp
        where hp.user_id = h.user_id and hp.deleted_at is null
          and hp.start_date <= pq.d and (hp.end_date is null or hp.end_date >= pq.d)
      )
    union all
    select r.user_id, 'routine', r.id, r.title, false, pq.d, '/routines/' || r.id || '/run', null, pq.in_quiet, pq.silence_priority
    from public.routines r
    join people_q pq on pq.user_id = r.user_id
    where r.deleted_at is null
      and r.notify_time is not null
      and pq.t >= r.notify_time
      and pq.d >= r.start_date
      and extract(dow from pq.d)::smallint = any (r.weekdays)
      and public.on_week(r.start_date, r.week_interval, pq.d)
      and not exists (
        select 1 from public.routine_runs run
        where run.routine_id = r.id and run.date = pq.d and run.deleted_at is null and run.finished_at is not null
      )
    union all
    -- High tasks with a reminder (SPEC §5 High-priority tasks, 2026-11-18): on the task's day, and each later day
    -- while it carries over and is still open.
    select tk.user_id, 'task', tk.id, tk.title, true, pq.d, '/tasks', null, pq.in_quiet, pq.silence_priority
    from public.tasks tk
    join people_q pq on pq.user_id = tk.user_id
    where tk.deleted_at is null
      and tk.status = 'open'
      and tk.priority = 3
      and tk.reminder_time is not null
      and tk.due_date is not null
      and tk.due_date <= pq.d
      and pq.t >= tk.reminder_time
    union all
    -- The evening reminder (SPEC §5 Journal): once a day at my chosen time, if anything for today is still left. The
    -- detail is how many, a newline, then up to 3 of their names ("Call mom, Water plants and 2 more"). Today's
    -- journal counts when it has no writing (has_writing, since a locked journal's writing is encrypted).
    select pq.user_id, 'evening', pq.user_id, 'Evening check-in', false, pq.d, '/',
           left_today.n::text || E'\n' || case
             when left_today.n > 3 then array_to_string(left_today.names[1:3], ', ') || ' and ' || (left_today.n - 3) || ' more'
             when left_today.n = 1 then left_today.names[1]
             else array_to_string(left_today.names[1:left_today.n - 1], ', ') || ' and ' || left_today.names[left_today.n]
           end,
           pq.in_quiet, pq.silence_priority
    from people_q pq
    cross join lateral (
      select count(*)::integer as n,
             array_agg(case when char_length(li.name) > 60 then left(li.name, 59) || '…' else li.name end
                       order by li.ord, li.name) as names
      from (
        select case when tk.priority = 3 then 1 else 2 end as ord, tk.title as name from public.tasks tk
          where tk.user_id = pq.user_id and tk.deleted_at is null and tk.status = 'open'
            and tk.due_date is not null and tk.due_date <= pq.d
        union all
        select 3, r.title from public.routines r
          where r.user_id = pq.user_id and r.deleted_at is null
            and pq.d >= r.start_date
            and extract(dow from pq.d)::smallint = any (r.weekdays)
            and public.on_week(r.start_date, r.week_interval, pq.d)
            and not exists (
              select 1 from public.routine_runs run
              where run.routine_id = r.id and run.date = pq.d and run.deleted_at is null and run.finished_at is not null)
        union all
        select 4, h.title from public.habits h
          where h.user_id = pq.user_id and h.deleted_at is null
            and public.habit_on(h.start_date, h.weekdays, h.week_interval, h.monthly, pq.d)
            and not exists (
              select 1 from public.habit_logs l
              where l.habit_id = h.id and l.date = pq.d and l.deleted_at is null and l.status = 'completed')
            and not exists (
              select 1 from public.habit_pauses hp
              where hp.user_id = h.user_id and hp.deleted_at is null
                and hp.start_date <= pq.d and (hp.end_date is null or hp.end_date >= pq.d))
        union all
        select 5, 'your journal' where not exists (
          select 1 from public.journal_entries j
          where j.user_id = pq.user_id and j.date = pq.d and j.deleted_at is null and j.has_writing)
      ) li
    ) left_today
    where pq.evening_time is not null
      and pq.t >= pq.evening_time
      and left_today.n > 0
    union all
    -- My own events (SPEC §5 Calendar and reminders): today's and tomorrow's occurrences, reminded the chosen
    -- number of minutes before they start (all-day events count from 9:00 am). Sent within 15 minutes of the
    -- start at the latest, so an event created after its reminder time still gets one if it has not started.
    select e.user_id, 'event', e.id, e.title, false, o.od,
           '/calendar?date=' || to_char(o.od, 'YYYY-MM-DD'),
           case when e.start_time is null then null else to_char(e.start_time, 'FMHH12:MI am') end,
           pq.in_quiet, pq.silence_priority
    from public.events e
    join people_q pq on pq.user_id = e.user_id
    cross join lateral (values (pq.d), (pq.d + 1)) as o(od)
    where e.deleted_at is null
      and e.reminder_minutes is not null
      and public.event_occurs_on(e.start_date, e.repeat, o.od)
      and pq.now_local >= (o.od + coalesce(e.start_time, '09:00'::time)) - make_interval(mins => e.reminder_minutes)
      and pq.now_local < (o.od + coalesce(e.start_time, '09:00'::time)) + interval '15 minutes'
  )
  select c.user_id, c.kind, c.item_id, c.title, c.is_priority, c.local_date, c.url, c.detail
  from candidates c
  left join public.reminder_state s
    on s.kind = c.kind and s.item_id = c.item_id and s.date = c.local_date and s.deleted_at is null
  where (not c.in_quiet or (c.is_priority and not c.silence_priority))
    and s.cancelled_at is null
    and (s.snoozed_until is null or s.snoozed_until <= at)
    and (s.last_sent_at is null or (s.snoozed_until is not null and s.last_sent_at < s.snoozed_until));
$$;



create or replace function public.delete_my_data(parts text[] default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  everything constant text[] := array['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'tags', 'events', 'post_its', 'people', 'connections', 'cheers'];
  chosen text[] := coalesce(parts, everything);
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if cardinality(chosen) = 0 or not chosen <@ everything then
    raise exception 'Choose what to delete' using errcode = '22023';
  end if;

  if 'tasks' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'task';
    delete from public.item_tags where user_id = me and item_type = 'task';
    delete from public.tasks where user_id = me;
  end if;
  if 'inbox' = any (chosen) then
    delete from public.inbox where user_id = me;
  end if;
  if 'quests' = any (chosen) then
    delete from public.item_tags where user_id = me and item_type = 'quest';
    delete from public.quests where user_id = me;
  end if;
  if 'vault' = any (chosen) then
    delete from public.item_tags where user_id = me and item_type = 'vault_item';
    delete from public.vault_items where user_id = me;
    delete from public.vault_buckets where user_id = me;
    perform public.create_starter_buckets(me);
  end if;
  if 'journal' = any (chosen) then
    delete from public.item_tags where user_id = me and item_type = 'journal_entry';
    delete from public.journal_entries where user_id = me;
    delete from public.journal_passkeys where user_id = me;
    delete from public.journal_keys where user_id = me;
  end if;
  if 'habits' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'habit';
    delete from public.item_tags where user_id = me and item_type = 'habit';
    delete from public.habits where user_id = me;
    delete from public.habit_pauses where user_id = me;
  end if;
  if 'routines' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'routine';
    delete from public.item_tags where user_id = me and item_type = 'routine';
    delete from public.routines where user_id = me;
  end if;
  if 'events' = any (chosen) then
    delete from public.item_tags t using public.events e
    where t.user_id = me and t.item_type = 'event' and t.item_id = e.id and e.user_id = me
      and not exists (select 1 from public.event_invites i where i.event_id = e.id and i.deleted_at is null);
    delete from public.reminder_state s using public.events e
    where s.user_id = me and s.kind = 'event' and s.item_id = e.id and e.user_id = me
      and not exists (select 1 from public.event_invites i where i.event_id = e.id and i.deleted_at is null);
    delete from public.events e
    where e.user_id = me
      and not exists (select 1 from public.event_invites i where i.event_id = e.id and i.deleted_at is null);
  end if;
  if 'tags' = any (chosen) then
    delete from public.tags where user_id = me;
  end if;
  if 'post_its' = any (chosen) then
    delete from public.post_its where user_id = me;
  end if;
  if 'people' = any (chosen) then
    delete from public.people where user_id = me;
  end if;
  if 'connections' = any (chosen) then
    delete from public.connections where user_id = me or friend_id = me;
    delete from public.connection_requests where user_id = me or to_user = me;
  end if;
  if 'cheers' = any (chosen) then
    delete from public.cheer_posts where user_id = me;
    delete from public.cheer_reactions where user_id = me;
    delete from public.cheer_blocks where user_id = me;
  end if;

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;

drop table public.priority_task_logs;
drop table public.priority_tasks;
