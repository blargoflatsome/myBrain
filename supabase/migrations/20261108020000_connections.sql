-- Connections, part 1 (docs/SPEC.md §10 Connections): users connect only when both agree they know each other.
-- A request goes to an exact email or phone number and never reveals whether it belongs to an account. Everything
-- here is reached through the functions below; clients can't read or write these tables directly.

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- What the sender typed (shown back to them as "Sent"), and the account it matched, if any (never shown to them).
  to_contact text not null check (length(to_contact) between 3 and 320),
  to_user uuid references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  answered_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index connection_requests_to_idx on public.connection_requests (to_user, status);
create index connection_requests_from_idx on public.connection_requests (user_id, created_at);
create trigger connection_requests_set_updated_at before insert or update on public.connection_requests
  for each row execute function public.set_updated_at();

-- One row per side: I'm connected to friend_id.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (user_id <> friend_id)
);
create unique index connections_pair_idx on public.connections (user_id, friend_id) where deleted_at is null;
create trigger connections_set_updated_at before insert or update on public.connections
  for each row execute function public.set_updated_at();

create table public.connection_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  blocked_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, blocked_user)
);
create trigger connection_blocks_set_updated_at before insert or update on public.connection_blocks
  for each row execute function public.set_updated_at();

alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.connection_blocks enable row level security;
revoke all on public.connection_requests, public.connections, public.connection_blocks from anon, authenticated;

create function public.are_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connections c where c.user_id = a and c.friend_id = b and c.deleted_at is null);
$$;
revoke all on function public.are_connected(uuid, uuid) from public, anon, authenticated;

create function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connection_blocks x where x.deleted_at is null
                 and ((x.user_id = a and x.blocked_user = b) or (x.user_id = b and x.blocked_user = a)));
$$;
revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;

-- Ask to connect. Always answers the same way, whatever was typed.
create function public.request_connection(contact text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  typed text := btrim(coalesce(contact, ''));
  target uuid;
  my_name text;
  req uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if length(typed) < 3 or length(typed) > 320 then raise exception 'Type an email address or phone number' using errcode = '22023'; end if;
  if (select count(*) from public.connection_requests r where r.user_id = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'At most 20 connection requests a day' using errcode = '22023';
  end if;
  if position('@' in typed) > 0 then typed := lower(typed); end if;
  -- Already asked this address and still waiting: nothing new.
  if exists (select 1 from public.connection_requests r where r.user_id = me and r.to_contact = typed
             and r.status in ('pending', 'declined') and r.expires_at > now() and r.deleted_at is null) then
    return;
  end if;
  select p.user_id into target from public.profiles p
  where p.user_id <> me and p.deleted_at is null
    and ((position('@' in typed) > 0 and lower(p.email) = typed)
      or (position('@' in typed) = 0 and public.normalize_phone(p.phone) = public.normalize_phone(typed)))
  limit 1;
  if target is not null and (public.is_blocked(me, target) or public.are_connected(me, target)) then target := null; end if;
  insert into public.connection_requests (user_id, to_contact, to_user) values (me, typed, target) returning id into req;
  if target is not null then
    select coalesce(p.display_name, 'Someone') into my_name from public.profiles p where p.user_id = me;
    perform public.record_notification(target, 'connection_request', req, my_name || ' wants to connect',
      'Open Connections to answer.', '/connections', now());
  end if;
end;
$$;
revoke all on function public.request_connection(text) from public, anon;
grant execute on function public.request_connection(text) to authenticated;

-- Requests waiting for my answer.
create function public.incoming_connection_requests()
returns table (id uuid, display_name text, avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, coalesce(p.display_name, 'Someone'), p.avatar_url, r.created_at
  from public.connection_requests r join public.profiles p on p.user_id = r.user_id
  where r.to_user = auth.uid() and r.status = 'pending' and r.expires_at > now() and r.deleted_at is null
    and not public.is_blocked(r.user_id, r.to_user)
  order by r.created_at desc;
$$;
revoke all on function public.incoming_connection_requests() from public, anon;
grant execute on function public.incoming_connection_requests() to authenticated;

-- Requests I sent that are still waiting (a decline looks the same as no answer).
create function public.sent_connection_requests()
returns table (id uuid, contact text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.to_contact, r.created_at from public.connection_requests r
  where r.user_id = auth.uid() and r.status in ('pending', 'declined') and r.expires_at > now() and r.deleted_at is null
  order by r.created_at desc;
$$;
revoke all on function public.sent_connection_requests() from public, anon;
grant execute on function public.sent_connection_requests() to authenticated;

create function public.answer_connection_request(req uuid, answer text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  r public.connection_requests;
  my_name text;
begin
  select * into r from public.connection_requests x
  where x.id = req and x.to_user = me and x.status = 'pending' and x.expires_at > now() and x.deleted_at is null;
  if r.id is null then raise exception 'That request is no longer waiting' using errcode = '22023'; end if;
  if answer = 'accept' then
    insert into public.connections (user_id, friend_id) values (me, r.user_id), (r.user_id, me)
    on conflict (user_id, friend_id) where deleted_at is null do nothing;
    -- Any request between us, either way, is settled.
    update public.connection_requests x set status = 'accepted', answered_at = now()
    where x.status in ('pending', 'declined')
      and ((x.user_id = r.user_id and x.to_user = me) or (x.user_id = me and x.to_user = r.user_id));
    select coalesce(p.display_name, 'Someone') into my_name from public.profiles p where p.user_id = me;
    perform public.record_notification(r.user_id, 'connection_accepted', r.id, my_name || ' accepted your connection request',
      'You can now invite each other to events.', '/connections', now());
  elsif answer = 'decline' then
    update public.connection_requests x set status = 'declined', answered_at = now() where x.id = r.id;
  elsif answer = 'block' then
    insert into public.connection_blocks (user_id, blocked_user) values (me, r.user_id)
    on conflict (user_id, blocked_user) do update set deleted_at = null;
    update public.connection_requests x set status = 'declined', answered_at = now() where x.id = r.id;
  else
    raise exception 'Answer accept, decline or block' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.answer_connection_request(uuid, text) from public, anon;
grant execute on function public.answer_connection_request(uuid, text) to authenticated;

create function public.cancel_connection_request(req uuid) returns void
language sql security definer set search_path = '' as $$
  update public.connection_requests x set status = 'cancelled'
  where x.id = req and x.user_id = auth.uid() and x.status in ('pending', 'declined');
$$;
revoke all on function public.cancel_connection_request(uuid) from public, anon;
grant execute on function public.cancel_connection_request(uuid) to authenticated;

-- My connections, with their current name and picture.
create function public.my_connections()
returns table (friend_id uuid, display_name text, avatar_url text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.friend_id, coalesce(p.display_name, 'Someone'), p.avatar_url, c.created_at
  from public.connections c join public.profiles p on p.user_id = c.friend_id
  where c.user_id = auth.uid() and c.deleted_at is null and p.deleted_at is null
  order by lower(coalesce(p.display_name, ''));
$$;
revoke all on function public.my_connections() from public, anon;
grant execute on function public.my_connections() to authenticated;

-- Remove a connection (both sides), and optionally block them. Neither is announced.
create function public.remove_connection(friend uuid, also_block boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  update public.connections c set deleted_at = now()
  where c.deleted_at is null and ((c.user_id = me and c.friend_id = friend) or (c.user_id = friend and c.friend_id = me));
  if also_block then
    insert into public.connection_blocks (user_id, blocked_user) values (me, friend)
    on conflict (user_id, blocked_user) do update set deleted_at = null;
  end if;
end;
$$;
revoke all on function public.remove_connection(uuid, boolean) from public, anon;
grant execute on function public.remove_connection(uuid, boolean) to authenticated;

-- Invitations: an app user is invited in the app only if we're connected (SPEC §10 Connections); typed emails and
-- phone numbers of anyone else are guest invitations, even if they have an account.
create or replace function public.invite_people(event uuid, people jsonb)
returns table (invite_id uuid, name text, email text, phone text, token text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev public.events;
  host text;
  person jsonb;
  found uuid;
  tok text;
  new_id uuid;
  p_name text;
  p_email text;
  p_phone text;
  existing integer;
  w record;
begin
  select * into ev from public.events e where e.id = event and e.user_id = me and e.deleted_at is null;
  if ev.id is null then raise exception 'Not your event' using errcode = '42501'; end if;
  if ev.cancelled_at is not null then raise exception 'This event was cancelled' using errcode = '22023'; end if;
  select count(*) into existing from public.event_invites i where i.event_id = event and i.deleted_at is null;
  if existing + jsonb_array_length(people) > 25 then raise exception 'At most 25 people per event' using errcode = '22023'; end if;
  if public.messages_today(me, array['invite']) + jsonb_array_length(people) > 100 then
    raise exception 'At most 100 invitations a day' using errcode = '22023';
  end if;
  select coalesce(p.display_name, 'Someone') into host from public.profiles p where p.user_id = me;
  select * into w from public.event_when(ev);

  for person in select * from jsonb_array_elements(people) loop
    p_name := nullif(trim(person ->> 'name'), '');
    p_email := nullif(lower(trim(person ->> 'email')), '');
    p_phone := nullif(trim(person ->> 'phone'), '');
    found := null;
    tok := null;
    if person ? 'user_id' then
      select p.user_id, coalesce(p_name, p.display_name) into found, p_name
      from public.profiles p where p.user_id = (person ->> 'user_id')::uuid and public.are_connected(me, p.user_id);
      if found is null then continue; end if;
      p_email := null;
      p_phone := null;
    else
      if p_email is null and p_phone is null then continue; end if;
      -- Only a connection gets a typed invitation in the app; anyone else is a guest (SPEC §10 Connections).
      select p.user_id into found from public.profiles p
      where p.user_id <> me and p.deleted_at is null and public.are_connected(me, p.user_id)
        and ((p_email is not null and lower(p.email) = p_email)
          or (p_phone is not null and public.normalize_phone(p.phone) = public.normalize_phone(p_phone)))
      limit 1;
      tok := encode(extensions.gen_random_bytes(24), 'hex');
    end if;
    insert into public.event_invites (user_id, event_id, host_name, name, email, phone, token_hash)
    values (me, event, host, p_name, p_email, p_phone, case when tok is null then null else encode(extensions.digest(tok, 'sha256'), 'hex') end)
    returning id into new_id;
    if found is not null then
      insert into public.invite_recipients (invite_id, user_id) values (new_id, found);
    end if;
    perform public.queue_message(me, event, new_id, found, p_name, p_email, p_phone, 'invite',
      host || ' invited you to ' || ev.title,
      host || ' invited you to ' || ev.title || ' on ' || w.date_text || case when ev.start_time is null then '' else ' at ' || w.time_text end || '. Going?');
    invite_id := new_id;
    name := p_name;
    email := p_email;
    phone := p_phone;
    token := tok;
    return next;
  end loop;
end;
$$;

-- "Delete my data" gains a Connections part (docs/SPEC.md §8).
create or replace function public.delete_my_data(parts text[] default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  everything constant text[] := array['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'priority_tasks', 'tags', 'events', 'post_its', 'people', 'connections'];
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
  if 'connections' = any (chosen) then
    delete from public.connections where user_id = me or friend_id = me;
    delete from public.connection_requests where user_id = me or to_user = me;
  end if;

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;
revoke all on function public.delete_my_data(text[]) from public, anon;
grant execute on function public.delete_my_data(text[]) to authenticated;
