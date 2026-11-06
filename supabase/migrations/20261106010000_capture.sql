-- Step 2: quick capture destinations (docs/SPEC.md §4, §5 Quick capture, Tasks, The Vault, Random Quest).
-- Same conventions as the foundation migration: device-generated ids, server-set timestamps,
-- soft delete via deleted_at, RLS so users only touch their own rows, no hard deletes from clients.
-- Columns whose rules belong to later build steps (task priority levels, quest time/energy values) are
-- kept minimal here and finalized in those steps.

create type public.task_status as enum ('open', 'done', 'cancelled');
create type public.task_source as enum ('manual', 'capture', 'journal');
create type public.quest_status as enum ('open', 'accepted', 'done');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text,
  due_date date,               -- null = Undated list (SPEC §5 Tasks)
  priority smallint not null default 0,
  status public.task_status not null default 'open',
  completed_at timestamptz,
  source public.task_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vault_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bucket_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- An item can only live in a bucket owned by the same user.
  foreign key (bucket_id, user_id) references public.vault_buckets (id, user_id) on delete cascade
);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  details text,
  estimated_minutes integer check (estimated_minutes > 0),
  energy_level text,
  status public.quest_status not null default 'open',
  last_picked_at timestamptz,
  times_picked integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Shared setup for every user-owned table: server timestamps, RLS, owner-only policies, sync index, Realtime.
do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'vault_buckets', 'vault_items', 'quests', 'inbox'] loop
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

-- Starter Vault buckets (SPEC §5 The Vault).
create or replace function public.create_starter_buckets(owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.vault_buckets (user_id, name, position)
  values (owner, 'Shopping list', 0), (owner, 'Restaurant reviews', 1), (owner, 'Places to go', 2);
$$;
revoke execute on function public.create_starter_buckets(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  perform public.create_starter_buckets(new.id);
  return new;
end;
$$;

-- Users who signed up before this migration get their starter buckets now.
select public.create_starter_buckets(p.user_id)
from public.profiles p
where not exists (select 1 from public.vault_buckets b where b.user_id = p.user_id);
