-- Step 9: The Vault (check-off, ratings, links), events, tags (docs/SPEC.md §4, §5 The Vault, Global search and
-- tags, Calendar and reminders). Search runs on the device, so no server index is needed.

-- ---------- The Vault ----------
alter table public.vault_buckets add column checkable boolean not null default false;
update public.vault_buckets set checkable = true where name = 'Shopping list';
alter table public.vault_items
  add column rating smallint check (rating between 1 and 5),
  add column link text check (link is null or length(link) <= 2000),
  add column checked boolean not null default false;

create or replace function public.create_starter_buckets(owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.vault_buckets (user_id, name, position, checkable)
  values (owner, 'Shopping list', 0, true), (owner, 'Restaurant reviews', 1, false), (owner, 'Places to go', 2, false);
$$;
revoke execute on function public.create_starter_buckets(uuid) from public, anon, authenticated;

-- ---------- Events (personal; shared events come in step 11) ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text,
  -- Local dates and times in my timezone, like habits. No start time = all day.
  start_date date not null,
  start_time time,
  end_date date not null,
  end_time time,
  repeat text not null default 'never' check (repeat in ('never', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  -- Minutes before the start (null = no reminder). All-day events count from 9:00 am.
  reminder_minutes integer check (reminder_minutes between 0 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date >= start_date),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_date > start_date or end_time >= start_time)
);

-- Whether an event happens on a date (its repeat rule). Monthly events skip months without that day.
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
    when 'monthly' then extract(day from d) = extract(day from start_date)
    when 'yearly' then extract(month from d) = extract(month from start_date) and extract(day from d) = extract(day from start_date)
    else false
  end;
$$;

-- ---------- Tags ----------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
-- One tag per name per user, ignoring case.
create unique index tags_one_per_name on public.tags (user_id, lower(name)) where deleted_at is null;

create table public.item_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tag_id uuid not null,
  item_type text not null check (item_type in ('task', 'vault_item', 'journal_entry', 'quest', 'event')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A tag can only be used by the user who owns it.
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);
create unique index item_tags_once on public.item_tags (tag_id, item_type, item_id) where deleted_at is null;

do $$
declare
  t text;
begin
  foreach t in array array['events', 'tags', 'item_tags'] loop
    execute format('create trigger %1$s_set_updated_at before insert or update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: owner can read" on public.%1$I for select to authenticated
                    using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated
                    with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner can update" on public.%1$I for update to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create index %1$s_user_updated_idx on public.%1$I (user_id, updated_at)', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end
$$;

-- ---------- Event reminders ----------
alter table public.reminder_state drop constraint reminder_state_kind_check;
alter table public.reminder_state add constraint reminder_state_kind_check
  check (kind in ('habit', 'routine', 'priority_task', 'journal', 'event'));

-- Notification wording, now with a detail (an event's start time).
drop function public.reminder_text(text, text, boolean);
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
      when kind = 'journal' then 'Reminder: Past you asked that you journal today.'
      when kind = 'routine' then 'Past you lined this routine up for now. Tap to start.'
      else 'Reminder: past you asked for this today. Ready when you are.'
    end;
$$;

-- due_reminders gains event reminders and a detail column (its result type changes, so it is recreated).
drop function public.send_due_reminders(timestamptz);
drop function public.due_reminders(timestamptz);
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
           or (pt.due_date is null and pq.d >= pt.start_date and extract(dow from pq.d)::smallint = any (pt.weekdays)))
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

create or replace function public.send_due_reminders(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  p record;
  txt record;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
  app_url constant text := 'https://myadhdbrain.netlify.app';
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';

  for r in select * from public.due_reminders(at) loop
    select * into p from public.profiles where user_id = r.user_id;
    select * into txt from public.reminder_text(r.kind, r.title, r.is_priority, r.detail);

    if p.notify_ntfy and p.ntfy_topic is not null and length(p.ntfy_topic) >= 16 then
      -- ntfy JSON publishing: POST to the server root with the topic in the body.
      select net.http_post(
        url := 'https://ntfy.sh',
        body := jsonb_build_object(
          'topic', p.ntfy_topic,
          'title', txt.heading,
          'message', txt.body,
          'priority', case when r.is_priority then 5 else 3 end,
          'tags', case when r.is_priority then jsonb_build_array('rotating_light') else jsonb_build_array('brain') end,
          'click', app_url || r.url
        )
      ) into req;
      insert into public.notification_log (user_id, kind, item_id, channel, request_id) values (r.user_id, r.kind, r.item_id, 'ntfy', req);
    end if;

    if p.notify_web_push and fn_url is not null and fn_secret is not null then
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
      from public.push_subscriptions s where s.user_id = r.user_id and s.deleted_at is null;
      if subs is not null then
        select net.http_post(
          url := fn_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
          body := jsonb_build_object(
            'subscriptions', subs,
            'payload', jsonb_build_object(
              'title', txt.heading,
              'body', txt.body,
              'url', r.url,
              'tag', r.kind || ':' || r.item_id,
              'priority', r.is_priority
            )
          )
        ) into req;
        insert into public.notification_log (user_id, kind, item_id, channel, request_id) values (r.user_id, r.kind, r.item_id, 'webpush', req);
      end if;
    end if;

    insert into public.reminder_state (user_id, kind, item_id, date, last_sent_at)
    values (r.user_id, r.kind, r.item_id, r.local_date, at)
    on conflict (kind, item_id, date) where deleted_at is null do update set last_sent_at = excluded.last_sent_at;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.send_due_reminders(timestamptz) from public, anon, authenticated;
