-- Locking my journal (docs/SPEC.md §4, §5 Locking my journal, §8): end-to-end encryption of journal writing.

-- ---------- Facts kept readable beside the writing (for everyone, locked or not) ----------
alter table public.journal_entries
  add column word_count integer not null default 0,
  add column has_writing boolean not null default false;
alter table public.journal_entries
  add constraint journal_entries_word_count check (word_count between 0 and 200000) not valid;

-- Worked out once from the plain text already stored: tags become spaces, like plainText() on the device.
with words as (
  select id,
         btrim(regexp_replace(replace(regexp_replace(body, '<[^>]*>', ' ', 'g'), '&nbsp;', ' '), '\s+', ' ', 'g')) as txt
  from public.journal_entries
)
update public.journal_entries j
set has_writing = w.txt <> '',
    word_count = case when w.txt = '' then 0 else coalesce(array_length(regexp_split_to_array(w.txt, ' '), 1), 0) end
from words w
where w.id = j.id;

-- ---------- Size limits: plain writing as before, encrypted writing a little larger ----------
alter table public.journal_entries drop constraint if exists journal_entries_body_len;
alter table public.journal_entries drop constraint if exists journal_entries_tomorrow_len;
alter table public.journal_entries
  add constraint journal_entries_body_len
    check (case when body like 'enc:v1:%' then length(body) <= 1100000 else length(body) <= 200000 end) not valid,
  add constraint journal_entries_tomorrow_len
    check (case when tomorrow like 'enc:v1:%' then length(tomorrow) <= 120000 else length(tomorrow) <= 20000 end) not valid;

-- ---------- My journal key, wrapped by my passphrase and by my recovery key ----------
create table public.journal_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  version smallint not null default 1,
  kdf_salt text not null check (length(kdf_salt) <= 100),
  kdf_iterations integer not null check (kdf_iterations >= 600000),
  key_by_passphrase text not null check (length(key_by_passphrase) <= 200),
  recovery_salt text not null check (length(recovery_salt) <= 100),
  key_by_recovery text not null check (length(key_by_recovery) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- One live key per person (turning the lock off and on again makes a new one).
create unique index journal_keys_one_live on public.journal_keys (user_id) where deleted_at is null;

-- ---------- Passkeys that can unlock my journal ----------
create table public.journal_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  credential_id text not null check (length(credential_id) <= 1400),
  name text not null check (length(name) between 1 and 120),
  prf_salt text not null check (length(prf_salt) <= 100),
  wrapped_key text not null check (length(wrapped_key) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
declare
  t text;
begin
  foreach t in array array['journal_keys', 'journal_passkeys'] loop
    execute format('create trigger %1$s_set_updated_at before insert or update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy "%1$s: owner can read" on public.%1$s for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner can insert" on public.%1$s for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner can update" on public.%1$s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('create index %1$s_user_updated_idx on public.%1$s (user_id, updated_at)', t);
    execute format('alter publication supabase_realtime add table public.%1$s', t);
  end loop;
end
$$;

-- ---------- Once I've locked my journal, the server refuses plain writing from any device ----------
create or replace function public.journal_entries_require_encrypted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if ((new.body <> '' and new.body not like 'enc:v1:%')
      or (coalesce(new.tomorrow, '') <> '' and new.tomorrow not like 'enc:v1:%'))
     and exists (select 1 from public.journal_keys k where k.user_id = new.user_id and k.deleted_at is null) then
    raise exception 'This journal is locked: writing must be encrypted' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger journal_entries_require_encrypted before insert or update on public.journal_entries
  for each row execute function public.journal_entries_require_encrypted();

-- ---------- The journal reminder reads has_writing, not the writing ----------
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
    -- The optional daily journal reminder (SPEC §5 Journal): skipped once the day's entry has writing. Reads
    -- has_writing, since a locked journal's writing is encrypted (SPEC §5 Locking my journal).
    select pq.user_id, 'journal', pq.user_id, 'Journal', false, pq.d, '/journal', null, pq.in_quiet, pq.silence_priority
    from people_q pq
    where pq.journal_time is not null
      and pq.t >= pq.journal_time
      and not exists (
        select 1 from public.journal_entries j
        where j.user_id = pq.user_id and j.date = pq.d and j.deleted_at is null and j.has_writing
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

-- ---------- Delete my data (journal) removes the lock too ----------
create or replace function public.delete_my_data(parts text[] default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  everything constant text[] := array['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'priority_tasks', 'tags', 'events', 'post_its', 'people', 'connections'];
  chosen text[] := coalesce(parts, everything);
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if cardinality(chosen) = 0 or not chosen <@ everything then
    raise exception 'Choose what to delete' using errcode = '22023';
  end if;

  if 'tasks' = any (chosen) then
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
  if 'priority_tasks' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'priority_task';
    delete from public.priority_tasks where user_id = me;
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

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;
