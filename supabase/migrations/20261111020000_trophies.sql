-- SPEC §5 Trophies: levels on earned trophies, a log of what the app didn't record before, and counts that live
-- only on the server (connections ever made, people blocked).

-- One row per trophy (the first-time badges keep an empty list). Each entry is the day a level was earned, so the
-- list's length is the level: Bronze, Silver, Gold, Platinum, Diamond, Legendary.
alter table public.badges add column levels jsonb not null default '[]'::jsonb;
alter table public.badges
  add constraint badges_levels_list check (jsonb_typeof(levels) = 'array' and jsonb_array_length(levels) <= 6) not valid;

create table public.activity_log (
  -- Made on the device, so a retried upload never writes twice (SPEC §7).
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- A finished Focus session (detail.minutes), a capture (detail.type) or emptying the Orphans list.
  kind text not null constraint activity_log_kind check (kind in ('focus', 'capture', 'orphans_cleared')),
  at timestamptz not null,
  detail jsonb not null default '{}'::jsonb constraint activity_log_detail_size check (pg_column_size(detail) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger activity_log_set_updated_at before insert or update on public.activity_log
  for each row execute function public.set_updated_at();
alter table public.activity_log enable row level security;
create policy "activity_log: owner can read" on public.activity_log for select to authenticated
  using (user_id = (select auth.uid()));
create policy "activity_log: owner can insert" on public.activity_log for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "activity_log: owner can update" on public.activity_log for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.activity_log from anon;
create index activity_log_user_updated_idx on public.activity_log (user_id, updated_at);
alter publication supabase_realtime add table public.activity_log;

-- Connections ever made (removed ones still count: trophies are never taken away) and people I've ever blocked.
create or replace function public.trophy_counts()
returns table (connections integer, blocks integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(distinct case when c.user_id = auth.uid() then c.friend_id else c.user_id end)::integer
       from public.connections c
      where auth.uid() in (c.user_id, c.friend_id)),
    (select count(*)::integer from public.connection_blocks b where b.user_id = auth.uid());
$$;
revoke all on function public.trophy_counts() from public, anon;
grant execute on function public.trophy_counts() to authenticated;
