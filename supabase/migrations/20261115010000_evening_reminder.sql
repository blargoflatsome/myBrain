-- Evening reminder (docs/SPEC.md §5 Journal, 2026-11-15): the journal reminder becomes a general evening reminder,
-- on by default at 9:00 pm, sent when anything for today is still left (tasks, habits, routines, priority tasks,
-- the journal), saying how many.

alter table public.profiles rename column journal_reminder_time to evening_reminder_time;
alter table public.profiles alter column evening_reminder_time set default '21:00';
-- The journal reminder was off by default, so no one chose off: everyone starts at 9:00 pm.
update public.profiles set evening_reminder_time = '21:00' where evening_reminder_time is null;

alter table public.reminder_state drop constraint reminder_state_kind_check;
update public.reminder_state set kind = 'evening' where kind = 'journal';
alter table public.reminder_state add constraint reminder_state_kind_check
  check (kind in ('habit', 'routine', 'priority_task', 'evening', 'event'));

-- Wording (SPEC §2 voice): the evening reminder says how many things are left.
create or replace function public.reminder_text(kind text, title text, is_priority boolean, detail text default null)
returns table (heading text, body text)
language sql
immutable
set search_path = ''
as $$
  select
    case when is_priority then '⚠ ' || title else title end,
    case
      when is_priority then 'Past you marked this as important. Open My Brain to complete it.'
      when kind = 'event' and detail is not null then 'Past you put this on the calendar. Starts at ' || detail || '.'
      when kind = 'event' then 'Past you put this on the calendar.'
      when kind = 'evening' then 'Past you left you ' || coalesce(detail, 'a few') || case when detail = '1' then ' thing' else ' things' end
                                 || ' for today. Want to take a look before bed?'
      when kind = 'routine' then 'Past you lined this routine up for now. Tap to start.'
      else 'Reminder: past you asked for this today. Ready when you are.'
    end;
$$;

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
    select pt.user_id, 'priority_task', pt.id, pt.title, true, pq.d, '/', null, pq.in_quiet, pq.silence_priority
    from public.priority_tasks pt
    join people_q pq on pq.user_id = pt.user_id
    where pt.deleted_at is null
      and pq.t >= pt.reminder_time
      and (pt.due_date = pq.d
           or (pt.due_date is null and pq.d >= pt.start_date and extract(dow from pq.d)::smallint = any (pt.weekdays)
               and public.on_week(pt.start_date, pt.week_interval, pq.d)))
      and not exists (
        select 1 from public.priority_task_logs l
        where l.task_id = pt.id and l.date = pq.d and l.deleted_at is null
      )
    union all
    -- The evening reminder (SPEC §5 Journal, 2026-11-15): once a day at my chosen time, if anything for today is
    -- still left, with how many in the detail. Today's journal counts when it has no writing (has_writing, since a
    -- locked journal's writing is encrypted).
    select pq.user_id, 'evening', pq.user_id, 'Evening check-in', false, pq.d, '/', left_today.n::text, pq.in_quiet, pq.silence_priority
    from people_q pq
    cross join lateral (
      select
        (select count(*) from public.tasks tk
          where tk.user_id = pq.user_id and tk.deleted_at is null and tk.status = 'open'
            and tk.due_date is not null and tk.due_date <= pq.d)
      + (select count(*) from public.habits h
          where h.user_id = pq.user_id and h.deleted_at is null
            and public.habit_on(h.start_date, h.weekdays, h.week_interval, h.monthly, pq.d)
            and not exists (
              select 1 from public.habit_logs l
              where l.habit_id = h.id and l.date = pq.d and l.deleted_at is null and l.status = 'completed')
            and not exists (
              select 1 from public.habit_pauses hp
              where hp.user_id = h.user_id and hp.deleted_at is null
                and hp.start_date <= pq.d and (hp.end_date is null or hp.end_date >= pq.d)))
      + (select count(*) from public.routines r
          where r.user_id = pq.user_id and r.deleted_at is null
            and pq.d >= r.start_date
            and extract(dow from pq.d)::smallint = any (r.weekdays)
            and public.on_week(r.start_date, r.week_interval, pq.d)
            and not exists (
              select 1 from public.routine_runs run
              where run.routine_id = r.id and run.date = pq.d and run.deleted_at is null and run.finished_at is not null))
      + (select count(*) from public.priority_tasks pt
          where pt.user_id = pq.user_id and pt.deleted_at is null
            and (pt.due_date = pq.d
                 or (pt.due_date is null and pq.d >= pt.start_date and extract(dow from pq.d)::smallint = any (pt.weekdays)
                     and public.on_week(pt.start_date, pt.week_interval, pq.d)))
            and not exists (
              select 1 from public.priority_task_logs l
              where l.task_id = pt.id and l.date = pq.d and l.deleted_at is null))
      + (case when exists (
          select 1 from public.journal_entries j
          where j.user_id = pq.user_id and j.date = pq.d and j.deleted_at is null and j.has_writing) then 0 else 1 end)
      as n
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

