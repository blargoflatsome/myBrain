-- SPEC §5 Celebrations: badges I earn the first time I do something, and how lively celebrations are.

create table public.badges (
  -- Made on the device from my user id and the badge, so two devices earning it at once write one row (SPEC §7).
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null constraint badges_kind_len check (length(kind) <= 40),
  earned_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index badges_one_per_kind on public.badges (user_id, kind) where deleted_at is null;

create trigger badges_set_updated_at before insert or update on public.badges
  for each row execute function public.set_updated_at();
alter table public.badges enable row level security;
create policy "badges: owner can read" on public.badges for select to authenticated
  using (user_id = (select auth.uid()));
create policy "badges: owner can insert" on public.badges for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "badges: owner can update" on public.badges for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.badges from anon;
create index badges_user_updated_idx on public.badges (user_id, updated_at);
alter publication supabase_realtime add table public.badges;

-- Full (confetti and bounces), Gentle (a soft glow and the message) or Off (messages and badges only).
alter table public.profiles add column celebrations text not null default 'full';
alter table public.profiles
  add constraint profiles_celebrations_choice check (celebrations in ('full', 'gentle', 'off')) not valid;
