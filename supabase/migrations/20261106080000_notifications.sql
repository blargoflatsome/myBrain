-- Step 7: reminders, priority habits and tasks, push subscriptions, and the once-a-minute job
-- (docs/SPEC.md §5 Priority tasks and priority habits, §6 Notifications).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------- Settings ----------
alter table public.profiles
  add column notify_web_push boolean not null default true,
  add column notify_ntfy boolean not null default false,
  -- false = priority reminders still ring during quiet hours (the default, SPEC §5).
  add column quiet_hours_silence_priority boolean not null default false;

-- ---------- Priority habits ----------
alter table public.habits add column is_priority boolean not null default false;

-- ---------- Priority tasks: one-off (due_date) or repeating on weekdays ----------
create table public.priority_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  reminder_time time not null,
  due_date date,
  weekdays smallint[] check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}')),
  start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Exactly one of: a date (one-off) or weekdays (repeating).
  check ((due_date is null) <> (weekdays is null)),
  unique (id, user_id)
);

create table public.priority_task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  date date not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (task_id, user_id) references public.priority_tasks (id, user_id) on delete cascade
);
create unique index priority_task_logs_one_per_day on public.priority_task_logs (task_id, date) where deleted_at is null;

-- ---------- Per-day reminder state: snooze, cancel, and when it was last sent ----------
create table public.reminder_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('habit', 'routine', 'priority_task')),
  item_id uuid not null,
  date date not null,
  snoozed_until timestamptz,
  cancelled_at timestamptz,
  -- Written by the server job only (see send_due_reminders).
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index reminder_state_one_per_day on public.reminder_state (kind, item_id, date) where deleted_at is null;

-- ---------- One push subscription per device (not synced; written directly) ----------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_label text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- What was sent, by whom and how (SPEC §5: log every notification) ----------
create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  item_id uuid not null,
  channel text not null check (channel in ('webpush', 'ntfy')),
  request_id bigint,
  sent_at timestamptz not null default now(),
  checked boolean not null default false
);

do $$
declare
  t text;
begin
  foreach t in array array['priority_tasks', 'priority_task_logs', 'reminder_state', 'push_subscriptions'] loop
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
  end loop;
  foreach t in array array['priority_tasks', 'priority_task_logs', 'reminder_state'] loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end
$$;

-- Devices may remove their own subscription when turning push off.
create policy "push_subscriptions: owner can delete" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.notification_log enable row level security;
create policy "notification_log: owner can read" on public.notification_log for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.notification_log from anon;

-- ---------- Which reminders are due right now (SPEC §6) ----------
-- Reminder times are local times in each user's timezone. Quiet hours hold ordinary reminders until they end;
-- priority reminders ring anyway unless the user chose otherwise. Each reminder is sent once a day, and again
-- only after a snooze runs out. Cancelled or completed reminders are never sent.
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
           p.quiet_hours_silence_priority as silence_priority
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

-- Notification wording, in the "past you" voice (SPEC §2). The app's own wording lives in src/messages.ts;
-- this is the only other place, because these messages are written by the server.
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
      when kind = 'routine' then 'Past you lined this routine up for now. Tap to start.'
      else 'Reminder: past you asked for this today. Ready when you are.'
    end;
$$;

-- Send everything due: ntfy straight from the database, Web Push through the Netlify function (SPEC §6).
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
    select * into txt from public.reminder_text(r.kind, r.title, r.is_priority);

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

-- Remove push subscriptions the push service reported as gone (the function lists them in its reply).
create or replace function public.clean_push_subscriptions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  row record;
begin
  for row in
    select l.id, resp.content::jsonb as reply
    from public.notification_log l
    join net._http_response resp on resp.id = l.request_id
    where l.channel = 'webpush' and not l.checked and resp.status_code = 200
  loop
    update public.push_subscriptions set deleted_at = now()
    where deleted_at is null and endpoint in (select jsonb_array_elements_text(coalesce(row.reply -> 'gone', '[]'::jsonb)));
    get diagnostics n = row_count;
    update public.notification_log set checked = true where id = row.id;
  end loop;
  return n;
end;
$$;
revoke execute on function public.clean_push_subscriptions() from public, anon, authenticated;

select cron.schedule('my-brain-reminders', '* * * * *', 'select public.send_due_reminders()');
select cron.schedule('my-brain-clean-push', '*/10 * * * *', 'select public.clean_push_subscriptions()');
