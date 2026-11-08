-- Connections, part 3 (docs/SPEC.md §10 Connections): seeing who else is going, and connecting with them.
-- The host chooses whether attendees can see each other (on by default); each attendee can hide themselves.

alter table public.events add column show_guests boolean not null default true;
alter table public.event_invites add column visible boolean not null default true;

-- Am I part of this event: its host, or invited in the app and not out of it?
create function public.in_event(ev uuid, who uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = ev and e.user_id = who and e.deleted_at is null)
      or exists (select 1 from public.invite_recipients r join public.event_invites i on i.id = r.invite_id
                 where i.event_id = ev and r.user_id = who and i.deleted_at is null and i.response not in ('no', 'dropped'));
$$;
revoke all on function public.in_event(uuid, uuid) from public, anon, authenticated;

-- Who else is going, as I may see them: the host, other attendees with accounts who chose to be visible (with
-- Connect where we aren't connected yet), and guests by first name only. Never emails or phone numbers.
create function public.event_attendees(event uuid)
returns table (user_id uuid, display_name text, avatar_url text, is_host boolean, connected boolean, can_connect boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev public.events;
begin
  select * into ev from public.events e where e.id = event and e.deleted_at is null;
  if ev.id is null or not public.in_event(event, me) then return; end if;
  if me <> ev.user_id and not ev.show_guests then return; end if;
  return query
  with people as (
    select ev.user_id as uid, true as host
    union
    select r.user_id, false from public.invite_recipients r join public.event_invites i on i.id = r.invite_id
    where i.event_id = event and i.deleted_at is null and i.visible and i.response in ('pending', 'yes', 'maybe')
  )
  select x.uid, coalesce(p.display_name, 'Someone'), p.avatar_url, x.host, public.are_connected(me, x.uid),
         not public.are_connected(me, x.uid)
           and not exists (select 1 from public.connection_requests q where q.deleted_at is null and q.expires_at > now()
                           and q.status in ('pending', 'declined')
                           and ((q.user_id = me and q.to_user = x.uid) or (q.user_id = x.uid and q.to_user = me)))
  from people x join public.profiles p on p.user_id = x.uid and p.deleted_at is null
  where x.uid <> me and not public.is_blocked(me, x.uid)
  union all
  select null::uuid, split_part(coalesce(nullif(btrim(i.name), ''), 'A guest'), ' ', 1), null::text, false, false, false
  from public.event_invites i
  where i.event_id = event and i.deleted_at is null and i.response in ('pending', 'yes', 'maybe')
    and not exists (select 1 from public.invite_recipients r where r.invite_id = i.id);
end;
$$;
revoke all on function public.event_attendees(uuid) from public, anon;
grant execute on function public.event_attendees(uuid) to authenticated;

-- Ask someone I'm at an event with to connect. They see which event it came from.
create function public.connect_via_event(event uuid, friend uuid) returns void
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
    raise exception 'At most 20 connection requests a day' using errcode = '22023';
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
revoke all on function public.connect_via_event(uuid, uuid) from public, anon;
grant execute on function public.connect_via_event(uuid, uuid) to authenticated;

-- An attendee shows or hides themselves from the event's other attendees.
create function public.set_event_visibility(invite uuid, show boolean) returns void
language sql security definer set search_path = '' as $$
  update public.event_invites i set visible = show
  where i.id = invite and exists (select 1 from public.invite_recipients r where r.invite_id = i.id and r.user_id = auth.uid());
$$;
revoke all on function public.set_event_visibility(uuid, boolean) from public, anon;
grant execute on function public.set_event_visibility(uuid, boolean) to authenticated;
