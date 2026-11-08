-- Connections, part 4 (docs/SPEC.md §10 Connections): guest links and the edge cases around them.

-- Change notices are a message kind of their own.
alter table public.outbound_messages drop constraint outbound_messages_kind_check;
alter table public.outbound_messages add constraint outbound_messages_kind_check
  check (kind in ('invite', 'answer', 'message', 'cancel', 'dropout', 'update'));

-- A guest's link works until 30 days after the event (a repeating event: a year after the last answer). After that
-- the page says the event has passed and nothing can be changed.
create function public.guest_link_expired(inv public.event_invites) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when e.repeat = 'never' then e.end_date + 30 < current_date
              else coalesce(inv.responded_at, inv.created_at) < now() - interval '1 year' end
  from public.events e where e.id = inv.event_id;
$$;
revoke all on function public.guest_link_expired(public.event_invites) from public, anon, authenticated;

create function public.guest_invite_any(invite uuid, token text)
returns public.event_invites language sql stable security definer set search_path = '' as $$
  select i.* from public.event_invites i
  where i.id = invite and i.deleted_at is null and i.token_hash is not null
    and i.token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex');
$$;
revoke all on function public.guest_invite_any(uuid, text) from public, anon, authenticated;

-- Everything a guest can do goes through this, so an expired link can't change anything.
create or replace function public.guest_invite_row(invite uuid, token text)
returns public.event_invites language sql stable security definer set search_path = '' as $$
  select i.* from public.guest_invite_any(invite, token) i where i.id is not null and not coalesce(public.guest_link_expired(i), false);
$$;

drop function public.guest_invite(uuid, text);
create function public.guest_invite(invite uuid, token text)
returns table (host_name text, guest_name text, title text, notes text, start_date date, start_time time, end_date date, end_time time,
               repeat text, timezone text, response text, cancelled boolean, passed boolean)
language sql stable security definer set search_path = '' as $$
  select i.host_name, i.name, e.title, e.notes, e.start_date, e.start_time, e.end_date, e.end_time, e.repeat, p.timezone, i.response,
         e.cancelled_at is not null, coalesce(public.guest_link_expired(i), false)
  from public.guest_invite_any(invite, token) i
  join public.events e on e.id = i.event_id and e.deleted_at is null
  join public.profiles p on p.user_id = e.user_id and p.deleted_at is null;
$$;
revoke all on function public.guest_invite(uuid, text) from public;
grant execute on function public.guest_invite(uuid, text) to anon, authenticated;

-- A signed-in person on a guest page: 'claimed' (already in their account), 'match' (their account's email is the
-- one invited: it moves in on its own), 'ask' (a different email: ask "Accept as me?"), or 'none' (not signed in,
-- or they're the host). Phone numbers aren't verified yet, so they never match.
create function public.guest_claim_status(invite uuid, token text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null or i.id is null or i.user_id = auth.uid() then 'none'
    when exists (select 1 from public.invite_recipients r where r.invite_id = i.id and r.user_id = auth.uid()) then 'claimed'
    when exists (select 1 from public.invite_recipients r where r.invite_id = i.id) then 'none'
    when i.email is not null and lower(i.email) = lower((select p.email from public.profiles p where p.user_id = auth.uid())) then 'match'
    else 'ask' end
  from (select * from public.guest_invite_row(invite, token)) i;
$$;
revoke all on function public.guest_claim_status(uuid, text) from public, anon;
grant execute on function public.guest_claim_status(uuid, text) to authenticated;

-- Move a guest invitation into my account: it then shows on my calendar and I answer it in the app.
create function public.claim_guest_invite(invite uuid, token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  st text := public.guest_claim_status(invite, token);
begin
  if st not in ('match', 'ask') then return st = 'claimed'; end if;
  insert into public.invite_recipients (invite_id, user_id) values (invite, auth.uid());
  return true;
end;
$$;
revoke all on function public.claim_guest_invite(uuid, text) from public, anon;
grant execute on function public.claim_guest_invite(uuid, text) to authenticated;

-- Once two people connect, guest invitations between them (by the other's email) move into the app.
create function public.link_invites_between(a uuid, b uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.invite_recipients (invite_id, user_id)
  select i.id, case when i.user_id = a then b else a end
  from public.event_invites i
  where i.deleted_at is null and i.email is not null and i.user_id in (a, b)
    and lower(i.email) = lower((select p.email from public.profiles p where p.user_id = case when i.user_id = a then b else a end))
    and not exists (select 1 from public.invite_recipients r where r.invite_id = i.id);
$$;
revoke all on function public.link_invites_between(uuid, uuid) from public, anon, authenticated;

create or replace function public.answer_connection_request(req uuid, answer text) returns void
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
    perform public.link_invites_between(me, r.user_id);
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

create or replace function public.use_connect_link(token text default null, code text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  link public.connect_links := public.find_connect_link(token, code);
  owner_name text;
  my_name text;
begin
  if link.id is null then return null; end if;
  insert into public.connections (user_id, friend_id) values (me, link.user_id), (link.user_id, me)
  on conflict (user_id, friend_id) where deleted_at is null do nothing;
  update public.connect_links l set used_by = me, used_at = now() where l.id = link.id;
  perform public.link_invites_between(me, link.user_id);
  select coalesce(p.display_name, 'Someone') into owner_name from public.profiles p where p.user_id = link.user_id;
  select coalesce(p.display_name, 'Someone') into my_name from public.profiles p where p.user_id = me;
  perform public.record_notification(link.user_id, 'connection_accepted', link.id, my_name || ' connected with you',
    'They used your connect link. You can now invite each other to events.', '/connections', now());
  return owner_name;
end;
$$;

-- The host changed the date or time: let everyone know. App users get a push; guests are returned so the host can
-- message them one at a time (until email sending is on).
create function public.event_changed(event uuid)
returns table (invite_id uuid, name text, email text, phone text, body text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev public.events;
  host text;
  w record;
  inv record;
  msg text;
begin
  select * into ev from public.events e where e.id = event and e.user_id = me and e.deleted_at is null and e.cancelled_at is null;
  if ev.id is null then raise exception 'Not your event' using errcode = '42501'; end if;
  select coalesce(p.display_name, 'Someone') into host from public.profiles p where p.user_id = me;
  select * into w from public.event_when(ev);
  for inv in
    select i.*, r.user_id as recipient from public.event_invites i left join public.invite_recipients r on r.invite_id = i.id
    where i.event_id = event and i.deleted_at is null and i.response not in ('no', 'dropped')
  loop
    msg := 'Hi ' || coalesce(inv.name, 'there') || ', ' || host || ' changed ' || ev.title || ': it''s now on ' || w.date_text
      || case when ev.start_time is null then '' else ' at ' || w.time_text end || '.';
    perform public.queue_message(me, ev.id, inv.id, inv.recipient, inv.name, inv.email, inv.phone, 'update', ev.title || ' has changed', msg);
    if inv.recipient is null and (inv.email is not null or inv.phone is not null) then
      invite_id := inv.id; name := inv.name; email := inv.email; phone := inv.phone; body := msg;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function public.event_changed(uuid) from public, anon;
grant execute on function public.event_changed(uuid) to authenticated;
