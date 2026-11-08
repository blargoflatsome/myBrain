-- My people (docs/SPEC.md §4, §5 Calendar): people I've invited by email or phone, saved so I can pick them from a
-- list next time instead of typing them again.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text check (name is null or length(name) <= 120),
  email text check (email is null or length(email) <= 320),
  phone text check (phone is null or length(phone) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (email is not null or phone is not null)
);

create trigger people_set_updated_at before insert or update on public.people
  for each row execute function public.set_updated_at();
alter table public.people enable row level security;
create policy "people: owner can read" on public.people for select to authenticated
  using (user_id = (select auth.uid()));
create policy "people: owner can insert" on public.people for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "people: owner can update" on public.people for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.people from anon;
create index people_user_updated_idx on public.people (user_id, updated_at);
alter publication supabase_realtime add table public.people;

-- Everyone I've already invited by email or phone becomes one of my people (once each: the same email in any case,
-- or the same phone number in any formatting, keeping the most recent name).
insert into public.people (user_id, name, email, phone)
select distinct on (user_id, contact_key) user_id, name, email, phone
from (
  select
    user_id,
    nullif(btrim(name), '') as name,
    lower(btrim(email)) as email,
    case when email is null then btrim(phone) end as phone,
    coalesce('e:' || lower(btrim(email)), 'p:' || regexp_replace(phone, '\D', '', 'g')) as contact_key,
    created_at
  from public.event_invites
  where deleted_at is null and (email is not null or phone is not null)
) invited
order by user_id, contact_key, (name is null), created_at desc;

-- "Delete my data" gains a My people part (docs/SPEC.md §8).
create or replace function public.delete_my_data(parts text[] default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  everything constant text[] := array['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'priority_tasks', 'tags', 'events', 'post_its', 'people'];
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
    delete from public.item_tags where user_id = me and item_type = 'habit';
    delete from public.habits where user_id = me;
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

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;
revoke all on function public.delete_my_data(text[]) from public, anon;
grant execute on function public.delete_my_data(text[]) to authenticated;
