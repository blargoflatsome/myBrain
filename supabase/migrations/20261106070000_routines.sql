-- Step 6: routines (chained steps) and completion history (docs/SPEC.md §4, §5 Routines).

create type public.routine_step_status as enum ('completed', 'skipped');

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notify_time time,
  -- 0 = Sunday ... 6 = Saturday. Default every day.
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'),
  start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null,
  position integer not null default 0,
  title text not null check (length(trim(title)) > 0),
  -- The day the step was added: its stats start here.
  start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade
);

create table public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null,
  date date not null,
  started_at timestamptz not null,
  -- Set when the last step is completed or skipped (SPEC §5: completed overall).
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade
);
create unique index routine_runs_one_per_day on public.routine_runs (routine_id, date) where deleted_at is null;

create table public.routine_step_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  run_id uuid not null,
  step_id uuid not null,
  status public.routine_step_status not null,
  logged_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (run_id, user_id) references public.routine_runs (id, user_id) on delete cascade,
  foreign key (step_id, user_id) references public.routine_steps (id, user_id) on delete cascade
);
create unique index routine_step_logs_one_per_run on public.routine_step_logs (run_id, step_id) where deleted_at is null;

do $$
declare
  t text;
begin
  foreach t in array array['routines', 'routine_steps', 'routine_runs', 'routine_step_logs'] loop
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
