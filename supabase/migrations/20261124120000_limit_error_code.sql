-- SPEC §7 Things only the server can do (2026-11-24): every limit raises the limit code (P0429), so the app can
-- say which limit was reached instead of showing the server's text. Only the error codes change; each function
-- is otherwise exactly as last defined.

-- invite_people: from 20261119010000_remove_ntfy_phone_verify.sql
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
  if existing + jsonb_array_length(people) > 25 then raise exception 'At most 25 people per event' using errcode = 'P0429'; end if;
  if public.messages_today(me, array['invite']) + jsonb_array_length(people) > 100 then
    raise exception 'At most 100 invitations a day' using errcode = 'P0429';
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
      if exists (select 1 from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
                 where i.event_id = event and i.deleted_at is null and r.user_id = found) then
        continue;
      end if;
      p_email := null;
      p_phone := null;
    else
      if p_email is null and p_phone is null then continue; end if;
      select p.user_id into found from public.profiles p
      where p.user_id <> me and p.deleted_at is null and public.are_connected(me, p.user_id)
        and p_email is not null and lower(p.email) = p_email
      order by p.created_at
      limit 1;
      tok := encode(extensions.gen_random_bytes(24), 'hex');
    end if;
    insert into public.event_invites (user_id, event_id, host_name, name, email, phone, token_hash, optional)
    values (me, event, host, p_name, p_email, p_phone, case when tok is null then null else encode(extensions.digest(tok, 'sha256'), 'hex') end,
            coalesce((person ->> 'optional')::boolean, false))
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

-- message_event: from 20261107000000_shared_events.sql
create or replace function public.message_event(event uuid, audience text, message text)
returns table (invite_id uuid, name text, email text, phone text, body text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev public.events;
  mine public.event_invites;
  inv record;
  sender_name text;
  is_host boolean;
begin
  select * into ev from public.events e where e.id = event and e.deleted_at is null;
  if ev.id is null then raise exception 'No such event' using errcode = '42501'; end if;
  is_host := ev.user_id = me;
  if not is_host then
    select i.* into mine from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
    where i.event_id = event and r.user_id = me and i.deleted_at is null;
    if mine.id is null then raise exception 'Not your event' using errcode = '42501'; end if;
  end if;
  if length(trim(coalesce(message, ''))) = 0 or length(message) > 2000 then raise exception 'Write a message (up to 2000 characters)' using errcode = '22023'; end if;
  if public.messages_today(me, array['message']) >= 50 then raise exception 'At most 50 messages a day' using errcode = 'P0429'; end if;
  select coalesce(p.display_name, 'Someone') into sender_name from public.profiles p where p.user_id = me;

  if not is_host then
    perform public.queue_message(me, ev.id, mine.id, ev.user_id, mine.host_name, null, null, 'message', sender_name || ' about ' || ev.title, trim(message));
  end if;
  if audience = 'everyone' or is_host then
    for inv in
      select i.*, r.user_id as recipient from public.event_invites i left join public.invite_recipients r on r.invite_id = i.id
      where i.event_id = event and i.deleted_at is null and i.response not in ('no', 'dropped') and (mine.id is null or i.id <> mine.id)
    loop
      perform public.queue_message(me, ev.id, inv.id, inv.recipient, inv.name, inv.email, inv.phone, 'message', sender_name || ' about ' || ev.title, trim(message));
      if is_host and inv.recipient is null and (inv.email is not null or inv.phone is not null) then
        invite_id := inv.id; name := inv.name; email := inv.email; phone := inv.phone; body := trim(message);
        return next;
      end if;
    end loop;
  end if;
end;
$$;

-- request_connection: from 20261119010000_remove_ntfy_phone_verify.sql
create or replace function public.request_connection(contact text)
returns void
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
    raise exception 'At most 20 connection requests a day' using errcode = 'P0429';
  end if;
  if position('@' in typed) > 0 then typed := lower(typed); end if;
  -- Already asked this address and still waiting: nothing new.
  if exists (select 1 from public.connection_requests r where r.user_id = me and r.to_contact = typed
             and r.status in ('pending', 'declined') and r.expires_at > now() and r.deleted_at is null) then
    return;
  end if;
  select p.user_id into target from public.profiles p
  where p.user_id <> me and p.deleted_at is null
    and position('@' in typed) > 0 and lower(p.email) = typed
  order by p.created_at
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

-- connect_via_event: from 20261108050000_event_attendees.sql
create or replace function public.connect_via_event(event uuid, friend uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev_title text;
  their_name text;
  my_name text;
  req uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.event_attendees(event) a where a.user_id = friend and a.can_connect) then
    raise exception 'You can''t connect with them from this event' using errcode = '42501';
  end if;
  if (select count(*) from public.connection_requests r where r.user_id = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'At most 20 connection requests a day' using errcode = 'P0429';
  end if;
  select e.title into ev_title from public.events e where e.id = event;
  select coalesce(p.display_name, 'Someone') into their_name from public.profiles p where p.user_id = friend;
  select coalesce(p.display_name, 'Someone') into my_name from public.profiles p where p.user_id = me;
  insert into public.connection_requests (user_id, to_contact, to_user)
  values (me, case when length(their_name) >= 3 then left(their_name, 320) else 'Someone' end, friend) returning id into req;
  perform public.record_notification(friend, 'connection_request', req, my_name || ', from ' || coalesce(ev_title, 'an event') || ', wants to connect',
    'Open Connections to answer.', '/connections', now());
end;
$$;

-- guest_connect_with_host: from 20261108040000_connect_from_people_and_guests.sql
create or replace function public.guest_connect_with_host(invite uuid, token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  inv public.event_invites := public.guest_invite_row(invite, token);
  ev_title text;
  my_name text;
  req uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if inv.id is null then raise exception 'This link no longer works' using errcode = '42501'; end if;
  if not coalesce(public.guest_connect_offer(invite, token), false) then return; end if;
  if (select count(*) from public.connection_requests r where r.user_id = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'At most 20 connection requests a day' using errcode = 'P0429';
  end if;
  select e.title into ev_title from public.events e where e.id = inv.event_id;
  select coalesce(p.display_name, 'Someone') into my_name from public.profiles p where p.user_id = me;
  insert into public.connection_requests (user_id, to_contact, to_user)
  values (me, case when length(btrim(coalesce(inv.host_name, ''))) >= 3 then left(inv.host_name, 320) else 'Your host' end, inv.user_id)
  returning id into req;
  perform public.record_notification(inv.user_id, 'connection_request', req,
    my_name || ', your guest at ' || coalesce(ev_title, 'your event') || ', wants to connect', 'Open Connections to answer.', '/connections', now());
end;
$$;

-- create_connect_link: from 20261108030000_connect_links.sql
create or replace function public.create_connect_link()
returns table (id uuid, token text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  t text := encode(extensions.gen_random_bytes(24), 'hex');
  c text := '';
  link public.connect_links;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.connect_links l where l.user_id = me and l.used_at is null and l.cancelled_at is null
      and l.expires_at > now()) >= 5 then
    raise exception 'At most 5 links at a time' using errcode = 'P0429';
  end if;
  for i in 0..7 loop
    c := c || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  insert into public.connect_links (user_id, token_hash, code_hash) values (me, public.connect_hash(t), public.connect_hash(c))
  returning * into link;
  id := link.id;
  token := t;
  code := c;
  expires_at := link.expires_at;
  return next;
end;
$$;

-- find_connect_link: from 20261108030000_connect_links.sql
create or replace function public.find_connect_link(token text, code text) returns public.connect_links
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  link public.connect_links;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if coalesce(token, '') = '' then
    if (select count(*) from public.connect_code_tries t where t.user_id = me and t.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Too many tries. Try again in an hour.' using errcode = 'P0429';
    end if;
    insert into public.connect_code_tries (user_id) values (me);
  end if;
  select * into link from public.connect_links l
  where (case when coalesce(token, '') <> '' then l.token_hash = public.connect_hash(token) else l.code_hash = public.connect_hash(code) end)
    and l.used_at is null and l.cancelled_at is null and l.expires_at > now() and l.deleted_at is null
    and l.user_id <> me and not public.is_blocked(me, l.user_id);
  return link;
end;
$$;

-- guest_message: from 20261107000000_shared_events.sql
create or replace function public.guest_message(invite uuid, token text, message text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.event_invites := public.guest_invite_row(invite, token);
  ev public.events;
begin
  if inv.id is null then raise exception 'This link no longer works' using errcode = '42501'; end if;
  if length(trim(coalesce(message, ''))) = 0 or length(message) > 2000 then raise exception 'Write a message (up to 2000 characters)' using errcode = '22023'; end if;
  if (select count(*) from public.outbound_messages o where o.invite_id = inv.id and o.kind = 'message' and o.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many messages today' using errcode = 'P0429';
  end if;
  select * into ev from public.events e where e.id = inv.event_id;
  perform public.queue_message(inv.user_id, ev.id, inv.id, inv.user_id, inv.host_name, null, null, 'message',
    coalesce(inv.name, 'A guest') || ' about ' || ev.title, trim(message));
end;
$$;
