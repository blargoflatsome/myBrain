-- Step 5: habits, habit logs, and the restricted streak view (docs/SPEC.md §4, §5 Habits, §5 Profile page).

create type public.habit_log_status as enum ('completed', 'missed');

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notify_time time,
  timer_minutes integer check (timer_minutes > 0 and timer_minutes <= 1440),
  -- 0 = Sunday ... 6 = Saturday. Default every day.
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'),
  start_date date not null default current_date,
  is_private boolean not null default false,
  -- Cached for display; habit_logs is the source of truth.
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A timer starts at the notify time, so it needs one.
  check (timer_minutes is null or notify_time is not null),
  unique (id, user_id)
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  status public.habit_log_status not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A log can only belong to a habit owned by the same user.
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  check ((status = 'completed') = (completed_at is not null))
);
-- One live log per habit per day.
create unique index habit_logs_one_per_day on public.habit_logs (habit_id, date) where deleted_at is null;

do $$
declare
  t text;
begin
  foreach t in array array['habits', 'habit_logs'] loop
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

-- The only way anyone else can see streaks (SPEC §5 Profile page): habit title and streak numbers, never private
-- habits, and only for profiles set to "everyone". "People I approve" needs Phase 2 approvals, so it shares nothing yet.
-- Owned by postgres so it can read across users, but it filters every row itself.
create view public.shared_streaks
with (security_barrier = true)
as
select h.user_id, p.display_name, h.title, h.current_streak, h.best_streak
from public.habits h
join public.profiles p on p.user_id = h.user_id
where h.deleted_at is null
  and h.is_private = false
  and p.deleted_at is null
  and p.streak_visibility = 'everyone';

revoke all on public.shared_streaks from anon, public;
grant select on public.shared_streaks to authenticated;
