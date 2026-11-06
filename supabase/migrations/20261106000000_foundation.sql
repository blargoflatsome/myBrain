-- Step 1 foundation (docs/SPEC.md §4, §7, §8).
-- Shared conventions every later table follows:
--   id uuid pk, user_id -> auth.users, created_at, updated_at (server-set), deleted_at (soft delete)
--   Row-level security on, users see and change only their own rows, no hard deletes from clients.

-- updated_at is always set by the server clock, never the device (SPEC §4, §7).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create type public.visibility as enum ('private', 'approved', 'everyone');
create type public.event_notify_method as enum ('email', 'text', 'both');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  email text,
  phone text,
  phone_verified boolean not null default false,
  event_notify_method public.event_notify_method not null default 'email',
  timezone text not null default 'UTC',
  display_settings jsonb not null default '{}'::jsonb,
  ntfy_topic text,
  quiet_hours_start time,
  quiet_hours_end time,
  default_snooze_minutes integer not null default 10 check (default_snooze_minutes > 0),
  streak_visibility public.visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger profiles_set_updated_at
before insert or update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles: owner can insert"
  on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- No delete policy: clients soft-delete by setting deleted_at. Account deletion is a server function (SPEC §8).

revoke all on public.profiles from anon;

-- Create a profile automatically when someone signs up with Google.
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
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
