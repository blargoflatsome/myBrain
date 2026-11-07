-- Feedback round 1 (docs/SPEC.md §5): every week or every 2 weeks; journal "tomorrow" box and "better than
-- yesterday"; starred Vault buckets.

-- ---------- Every week or every 2 weeks ----------
alter table public.habits add column week_interval smallint not null default 1 check (week_interval in (1, 2));
alter table public.routines add column week_interval smallint not null default 1 check (week_interval in (1, 2));
alter table public.priority_tasks add column week_interval smallint not null default 1 check (week_interval in (1, 2));

-- Whether a date falls in an "on" week: every week, or every other week counted from the week of the start date
-- (weeks run Sunday to Saturday).
create or replace function public.on_week(start_date date, week_interval smallint, d date)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(week_interval, 1) = 1
      or ((d - extract(dow from d)::int) - (start_date - extract(dow from start_date)::int)) / 7 % 2 = 0;
$$;

alter table public.events drop constraint events_repeat_check;
alter table public.events add constraint events_repeat_check
  check (repeat in ('never', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'));

create or replace function public.event_occurs_on(start_date date, repeat text, d date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select d >= start_date and case repeat
    when 'never' then d = start_date
    when 'daily' then true
    when 'weekdays' then extract(isodow from d) between 1 and 5
    when 'weekly' then extract(dow from d) = extract(dow from start_date)
    when 'biweekly' then extract(dow from d) = extract(dow from start_date) and (d - start_date) / 7 % 2 = 0
    when 'monthly' then extract(day from d) = extract(day from start_date)
    when 'yearly' then extract(month from d) = extract(month from start_date) and extract(day from d) = extract(day from start_date)
    else false
  end;
$$;

-- ---------- Journal ----------
alter table public.journal_entries
  add column tomorrow text not null default '' check (length(tomorrow) <= 5000),
  add column better_than_yesterday boolean;

-- ---------- Starred Vault buckets ----------
alter table public.vault_buckets add column starred boolean not null default false;

-- ---------- Reminders follow every-2-weeks schedules ----------
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
           p.journal_reminder_time as journal_time,
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
      and pq.d >= h.start_date
      and extract(dow from pq.d)::smallint = any (h.weekdays)
      and public.on_week(h.start_date, h.week_interval, pq.d)
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = h.id and l.date = pq.d and l.deleted_at is null and l.status = 'completed'
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
    -- The optional daily journal reminder (SPEC §5 Journal): skipped once the day's entry has writing.
    select pq.user_id, 'journal', pq.user_id, 'Journal', false, pq.d, '/journal', null, pq.in_quiet, pq.silence_priority
    from people_q pq
    where pq.journal_time is not null
      and pq.t >= pq.journal_time
      and not exists (
        select 1 from public.journal_entries j
        where j.user_id = pq.user_id and j.date = pq.d and j.deleted_at is null and length(trim(coalesce(j.body, ''))) > 0
      )
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
revoke execute on function public.due_reminders(timestamptz) from public, anon, authenticated;
