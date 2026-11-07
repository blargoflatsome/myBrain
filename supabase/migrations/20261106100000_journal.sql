-- Step 8: Journal (docs/SPEC.md §5 Journal). One entry per day with an auto-generated stats snapshot,
-- the optional daily journal reminder, and a completion time on quests so completed quests can be counted by day.

-- ---------- Journal entries ----------
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  body text not null default '',
  -- The day's stats (tasks, habits, routines, priority items, streaks, quests), written by the app.
  stats jsonb not null default '{}'::jsonb,
  -- True once the day has ended and the stats are frozen.
  stats_final boolean not null default false,
  -- True when the app wrote the entry on the user's behalf for a missed day.
  auto boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- One live entry per day.
create unique index journal_entries_one_per_day on public.journal_entries (user_id, date) where deleted_at is null;

create trigger journal_entries_set_updated_at before insert or update on public.journal_entries
  for each row execute function public.set_updated_at();
alter table public.journal_entries enable row level security;
create policy "journal_entries: owner can read" on public.journal_entries for select to authenticated
  using (user_id = (select auth.uid()));
create policy "journal_entries: owner can insert" on public.journal_entries for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "journal_entries: owner can update" on public.journal_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.journal_entries from anon;
create index journal_entries_user_updated_idx on public.journal_entries (user_id, updated_at);
alter publication supabase_realtime add table public.journal_entries;

-- ---------- Quests: when they were completed ----------
alter table public.quests add column completed_at timestamptz;
-- Best guess for quests already done: when they were last changed.
update public.quests set completed_at = updated_at where status = 'done' and completed_at is null;

-- ---------- Optional daily journal reminder (null = off, the default) ----------
alter table public.profiles add column journal_reminder_time time;

alter table public.reminder_state drop constraint reminder_state_kind_check;
alter table public.reminder_state add constraint reminder_state_kind_check
  check (kind in ('habit', 'routine', 'priority_task', 'journal'));

create or replace function public.due_reminders(at timestamptz default now())
returns table (
  user_id uuid,
  kind text,
  item_id uuid,
  title text,
  is_priority boolean,
  local_date date,
  url text
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
           p.journal_reminder_time as journal_time
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
           '/habits'::text as url, pq.in_quiet, pq.silence_priority
    from public.habits h
    join people_q pq on pq.user_id = h.user_id
    where h.deleted_at is null
      and h.notify_time is not null
      and pq.t >= h.notify_time
      and pq.d >= h.start_date
      and extract(dow from pq.d)::smallint = any (h.weekdays)
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = h.id and l.date = pq.d and l.deleted_at is null and l.status = 'completed'
      )
    union all
    select r.user_id, 'routine', r.id, r.title, false, pq.d, '/routines/' || r.id || '/run', pq.in_quiet, pq.silence_priority
    from public.routines r
    join people_q pq on pq.user_id = r.user_id
    where r.deleted_at is null
      and r.notify_time is not null
      and pq.t >= r.notify_time
      and pq.d >= r.start_date
      and extract(dow from pq.d)::smallint = any (r.weekdays)
      and not exists (
        select 1 from public.routine_runs run
        where run.routine_id = r.id and run.date = pq.d and run.deleted_at is null and run.finished_at is not null
      )
    union all
    select pt.user_id, 'priority_task', pt.id, pt.title, true, pq.d, '/', pq.in_quiet, pq.silence_priority
    from public.priority_tasks pt
    join people_q pq on pq.user_id = pt.user_id
    where pt.deleted_at is null
      and pq.t >= pt.reminder_time
      and (pt.due_date = pq.d
           or (pt.due_date is null and pq.d >= pt.start_date and extract(dow from pq.d)::smallint = any (pt.weekdays)))
      and not exists (
        select 1 from public.priority_task_logs l
        where l.task_id = pt.id and l.date = pq.d and l.deleted_at is null
      )
    union all
    -- The optional daily journal reminder (SPEC §5 Journal): skipped once the day's entry has writing.
    select pq.user_id, 'journal', pq.user_id, 'Journal', false, pq.d, '/journal', pq.in_quiet, pq.silence_priority
    from people_q pq
    where pq.journal_time is not null
      and pq.t >= pq.journal_time
      and not exists (
        select 1 from public.journal_entries j
        where j.user_id = pq.user_id and j.date = pq.d and j.deleted_at is null and length(trim(coalesce(j.body, ''))) > 0
      )
  )
  select c.user_id, c.kind, c.item_id, c.title, c.is_priority, c.local_date, c.url
  from candidates c
  left join public.reminder_state s
    on s.kind = c.kind and s.item_id = c.item_id and s.date = c.local_date and s.deleted_at is null
  where (not c.in_quiet or (c.is_priority and not c.silence_priority))
    and s.cancelled_at is null
    and (s.snoozed_until is null or s.snoozed_until <= at)
    and (s.last_sent_at is null or (s.snoozed_until is not null and s.last_sent_at < s.snoozed_until));
$$;
revoke execute on function public.due_reminders(timestamptz) from public, anon, authenticated;

create or replace function public.reminder_text(kind text, title text, is_priority boolean)
returns table (heading text, body text)
language sql
immutable
set search_path = ''
as $$
  select
    case when is_priority then '⚠ ' || title else title end,
    case
      when is_priority then 'Past you marked this as important. Open My Brain to complete it.'
      when kind = 'journal' then 'Reminder: Past you asked that you journal today.'
      when kind = 'routine' then 'Past you lined this routine up for now. Tap to start.'
      else 'Reminder: past you asked for this today. Ready when you are.'
    end;
$$;

