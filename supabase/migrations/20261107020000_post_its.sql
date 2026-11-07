-- Post Its (docs/SPEC.md §4, §5 Quick capture and Dashboard): sticky notes shown at the top of the Dashboard.
create table public.post_its (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (length(body) between 1 and 20000),
  color text not null default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green')),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger post_its_set_updated_at before insert or update on public.post_its
  for each row execute function public.set_updated_at();
alter table public.post_its enable row level security;
create policy "post_its: owner can read" on public.post_its for select to authenticated
  using (user_id = (select auth.uid()));
create policy "post_its: owner can insert" on public.post_its for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "post_its: owner can update" on public.post_its for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.post_its from anon;
create index post_its_user_updated_idx on public.post_its (user_id, updated_at);
alter publication supabase_realtime add table public.post_its;

-- "Delete my data" gains a Post Its part (docs/SPEC.md §8).
create or replace function public.delete_my_data(parts text[] default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  everything constant text[] := array['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'priority_tasks', 'tags', 'events', 'post_its'];
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
  end if;
  if 'habits' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'habit';
    delete from public.habits where user_id = me;
  end if;
  if 'routines' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'routine';
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

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;
revoke all on function public.delete_my_data(text[]) from public, anon;
grant execute on function public.delete_my_data(text[]) to authenticated;
