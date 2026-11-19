-- Shared Vaults, step 2 (docs/SPEC.md §5 The Vault, Shared Vaults; 2026-11-18, user): Share with people.
-- A bucket's owner shares it with connections, who can add, edit, check off and delete its items. Only the owner
-- changes the bucket itself. A vault item's user_id stays the bucket's owner (so the owner's rules, Delete my data and
-- account deletion work as before); added_by says who added it.

-- 1. Who added an item. Existing items were added by their owner. Deleting an account leaves its items unmarked.
alter table public.vault_items add column added_by uuid references auth.users (id) on delete set null;
update public.vault_items set added_by = user_id where added_by is null;
create index vault_items_added_by_idx on public.vault_items (added_by);

-- 2. Shares: changed only through the functions below; read by the owner and the member.
create table public.vault_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id uuid not null references public.vault_buckets (id) on delete cascade,
  member uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vault_shares_once unique (bucket_id, member),
  constraint vault_shares_not_self check (member <> user_id)
);
create trigger vault_shares_set_updated_at before insert or update on public.vault_shares
  for each row execute function public.set_updated_at();
alter table public.vault_shares enable row level security;
create policy "vault_shares: owner or member can read" on public.vault_shares for select to authenticated
  using (user_id = (select auth.uid()) or member = (select auth.uid()));
revoke all on public.vault_shares from anon, authenticated;
grant select on public.vault_shares to authenticated;
create index vault_shares_member_idx on public.vault_shares (member) where deleted_at is null;
create index vault_shares_user_idx on public.vault_shares (user_id);

-- 3. My star on a bucket shared with me (my own buckets keep theirs on the bucket). Stars are per person.
create table public.vault_stars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bucket_id uuid not null references public.vault_buckets (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vault_stars_once unique (user_id, bucket_id)
);
create trigger vault_stars_set_updated_at before insert or update on public.vault_stars
  for each row execute function public.set_updated_at();
alter table public.vault_stars enable row level security;
create policy "vault_stars: owner can read" on public.vault_stars for select to authenticated
  using (user_id = (select auth.uid()));
create policy "vault_stars: owner can insert" on public.vault_stars for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "vault_stars: owner can update" on public.vault_stars for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke delete on public.vault_stars from authenticated;
revoke all on public.vault_stars from anon;
create index vault_stars_bucket_idx on public.vault_stars (bucket_id);

-- 4. Am I a member of this bucket (a live share)?
create function public.is_vault_member(bucket uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vault_shares s where s.bucket_id = bucket and s.member = auth.uid() and s.deleted_at is null);
$$;
revoke all on function public.is_vault_member(uuid) from public, anon;
grant execute on function public.is_vault_member(uuid) to authenticated;

-- 5. Members read a shared bucket (never change it), and read and write its items.
create policy "vault_buckets: member can read" on public.vault_buckets for select to authenticated
  using (public.is_vault_member(id));
create policy "vault_items: member can read" on public.vault_items for select to authenticated
  using (public.is_vault_member(bucket_id));
create policy "vault_items: member can insert" on public.vault_items for insert to authenticated
  with check (public.is_vault_member(bucket_id));
create policy "vault_items: member can update" on public.vault_items for update to authenticated
  using (public.is_vault_member(bucket_id)) with check (public.is_vault_member(bucket_id));

-- 6. An item always belongs to its bucket's owner; added_by is set once, by whoever added it, and never changes.
create function public.vault_item_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := coalesce((select b.user_id from public.vault_buckets b where b.id = new.bucket_id), new.user_id);
  if tg_op = 'INSERT' then
    new.added_by := coalesce(auth.uid(), new.added_by, new.user_id);
  elsif not (new.added_by is null and old.added_by = auth.uid()) then
    -- The only change allowed: I un-mark an item I added (Delete my data).
    new.added_by := old.added_by;
  end if;
  return new;
end;
$$;
create trigger vault_items_owner before insert or update on public.vault_items
  for each row execute function public.vault_item_owner();

-- 7. Sharing, unsharing and leaving. Sharing touches the bucket and its items so the member's next sync downloads them.
create function public.share_vault_bucket(bucket uuid, friend uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  b public.vault_buckets;
  n integer;
  owner_name text;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into b from public.vault_buckets x where x.id = bucket and x.user_id = me and x.deleted_at is null;
  if b.id is null or friend is null or friend = me or not public.are_connected(me, friend) or public.is_blocked(me, friend) then
    raise exception 'Not available' using errcode = '42501';
  end if;
  if exists (select 1 from public.vault_shares s where s.bucket_id = bucket and s.member = friend and s.deleted_at is null) then return; end if;
  select count(*) into n from public.vault_shares s where s.bucket_id = bucket and s.deleted_at is null;
  if n >= 25 then raise exception 'A bucket can be shared with 25 people at most' using errcode = 'P0429'; end if;
  insert into public.vault_shares (user_id, bucket_id, member) values (me, bucket, friend)
  on conflict (bucket_id, member) do update set deleted_at = null;
  update public.vault_buckets set updated_at = now() where id = bucket;
  update public.vault_items set updated_at = now() where bucket_id = bucket;
  select p.display_name into owner_name from public.profiles p where p.user_id = me;
  perform public.record_notification(friend, 'vault_shared', bucket, left(coalesce(owner_name, 'Someone') || ' shared a list with you', 200),
                                     b.name, '/vault?bucket=' || bucket, now());
end;
$$;
revoke all on function public.share_vault_bucket(uuid, uuid) from public, anon;
grant execute on function public.share_vault_bucket(uuid, uuid) to authenticated;

create function public.unshare_vault_bucket(bucket uuid, friend uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  update public.vault_shares set deleted_at = now()
  where bucket_id = bucket and member = friend and user_id = auth.uid() and deleted_at is null;
end;
$$;
revoke all on function public.unshare_vault_bucket(uuid, uuid) from public, anon;
grant execute on function public.unshare_vault_bucket(uuid, uuid) to authenticated;

create function public.leave_vault_bucket(bucket uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  update public.vault_shares set deleted_at = now() where bucket_id = bucket and member = auth.uid() and deleted_at is null;
  update public.vault_stars set deleted_at = now() where bucket_id = bucket and user_id = auth.uid() and deleted_at is null;
end;
$$;
revoke all on function public.leave_vault_bucket(uuid) from public, anon;
grant execute on function public.leave_vault_bucket(uuid) to authenticated;

-- 8. Names for "Shared by" and "Added by", and the owner's list of who it's shared with: for each bucket I own or am
-- a member of, its owner and members, each with a name only when it's me or a connection (the device says "someone").
create function public.vault_people()
returns table (bucket_id uuid, person uuid, display_name text, is_owner boolean)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select b.id, b.user_id from public.vault_buckets b
    where b.deleted_at is null and (b.user_id = auth.uid() or public.is_vault_member(b.id))
  ), people as (
    select m.id as bucket_id, m.user_id as person, true as is_owner from mine m
    union all
    select s.bucket_id, s.member, false from public.vault_shares s join mine m on m.id = s.bucket_id where s.deleted_at is null
  )
  select x.bucket_id, x.person,
    case when x.person = auth.uid() or public.are_connected(auth.uid(), x.person) then p.display_name end,
    x.is_owner
  from people x left join public.profiles p on p.user_id = x.person
  where auth.uid() is not null;
$$;
revoke all on function public.vault_people() from public, anon;
grant execute on function public.vault_people() to authenticated;

-- 9. Ending a connection (removed, blocked or deleted) ends sharing between the two, both ways.
create function public.end_vault_shares()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a uuid;
  z uuid;
begin
  if tg_op = 'DELETE' then
    a := old.user_id; z := old.friend_id;
  elsif new.deleted_at is not null and old.deleted_at is null then
    a := new.user_id; z := new.friend_id;
  else
    return null;
  end if;
  update public.vault_shares set deleted_at = now()
  where deleted_at is null and ((user_id = a and member = z) or (user_id = z and member = a));
  return null;
end;
$$;
create trigger connections_end_vault_shares after update or delete on public.connections
  for each row execute function public.end_vault_shares();

-- 10. Delete my data (latest in 20261118010000_high_priority_tasks.sql): the Vault part also un-marks items I added to
-- other people's buckets and removes my stars on shared buckets. Buckets I own go for everyone (their shares go with them).
create or replace function public.delete_my_data(parts text[] default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  everything constant text[] := array['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'tags', 'events', 'post_its', 'people', 'connections', 'cheers'];
  chosen text[] := coalesce(parts, everything);
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if cardinality(chosen) = 0 or not chosen <@ everything then
    raise exception 'Choose what to delete' using errcode = '22023';
  end if;

  if 'tasks' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'task';
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
    -- Items I added to other people's shared buckets stay in their lists, no longer marked as mine.
    update public.vault_items set added_by = null where added_by = me and user_id <> me;
    delete from public.vault_stars where user_id = me;
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
  if 'cheers' = any (chosen) then
    delete from public.cheer_posts where user_id = me;
    delete from public.cheer_reactions where user_id = me;
    delete from public.cheer_blocks where user_id = me;
  end if;

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;
