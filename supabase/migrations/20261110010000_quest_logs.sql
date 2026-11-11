-- SPEC §5 Random Quest (feedback round 4): quests aren't one-time tasks. Marking one done logs the completion and the
-- quest stays in the list to be picked again. The Journal and Dashboard count completions from quest_logs.
-- Also: formatted notes (SPEC §5 Formatted notes) make priority task descriptions longer, so their limit matches notes.

alter table public.quests add constraint quests_id_user_key unique (id, user_id);

create table public.quest_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quest_id uuid not null,
  -- The day it was done, in my time zone.
  date date not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A completion can only belong to my own quest; deleting the quest (or Delete my data) removes its log.
  foreign key (quest_id, user_id) references public.quests (id, user_id) on delete cascade
);

create trigger quest_logs_set_updated_at before insert or update on public.quest_logs
  for each row execute function public.set_updated_at();
alter table public.quest_logs enable row level security;
create policy "quest_logs: owner can read" on public.quest_logs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "quest_logs: owner can insert" on public.quest_logs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "quest_logs: owner can update" on public.quest_logs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.quest_logs from anon;
create index quest_logs_user_updated_idx on public.quest_logs (user_id, updated_at);
create index quest_logs_quest_idx on public.quest_logs (quest_id);
alter publication supabase_realtime add table public.quest_logs;

-- Quests already done keep their completion, and come back to the list.
insert into public.quest_logs (user_id, quest_id, date, completed_at)
select q.user_id, q.id, (q.completed_at at time zone coalesce(p.timezone, 'UTC'))::date, q.completed_at
from public.quests q
left join public.profiles p on p.user_id = q.user_id
where q.status = 'done' and q.completed_at is not null and q.deleted_at is null;
update public.quests set status = 'open' where status = 'done' and deleted_at is null;

alter table public.priority_tasks drop constraint if exists priority_tasks_description_len;
alter table public.priority_tasks
  add constraint priority_tasks_description_len check (description is null or length(description) <= 20000) not valid;
