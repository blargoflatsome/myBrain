-- SPEC §5 Profiles (2026-11-12): a connection's profile (name, picture, earned trophies), no visibility setting,
-- and no second in-app invitation for someone already invited to the event.

-- 1. The streak visibility setting is gone: profiles work the same for everyone.
alter table public.profiles drop constraint if exists profiles_no_everyone;
alter table public.profiles drop column if exists streak_visibility;
drop type if exists public.visibility;

-- 2. A connection's profile. Only while we're connected and neither has blocked the other; nothing for anyone else.
--    Badges are only kind, first earned and level days (never what was done to earn them). invited_events: my events
--    they're already invited to, so the Invite to event window can say Invited.
create function public.connection_profile(friend uuid)
returns table (display_name text, avatar_url text, badges jsonb, invited_events uuid[])
language plpgsql stable security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if friend is null or friend = me or not public.are_connected(me, friend) or public.is_blocked(me, friend) then return; end if;
  return query
  select coalesce(p.display_name, 'Someone'),
    p.avatar_url,
    coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'earned_at', b.earned_at, 'levels', b.levels) order by b.earned_at)
              from public.badges b where b.user_id = friend and b.deleted_at is null), '[]'::jsonb),
    coalesce((select array_agg(distinct i.event_id) from public.event_invites i
              join public.invite_recipients r on r.invite_id = i.id
              where i.user_id = me and i.deleted_at is null and r.user_id = friend), '{}'::uuid[])
  from public.profiles p
  where p.user_id = friend and p.deleted_at is null;
end;
$$;
revoke all on function public.connection_profile(uuid) from public, anon;
grant execute on function public.connection_profile(uuid) to authenticated;

-- 3. invite_people (latest in 20261111030000_identity_lock.sql), now skipping a connection already invited.
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
      -- Already invited to this event: no second invitation (SPEC §5 Profiles, Invite to event).
      if exists (select 1 from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
                 where i.event_id = event and i.deleted_at is null and r.user_id = found) then
        continue;
      end if;
      p_email := null;
      p_phone := null;
    else
      if p_email is null and p_phone is null then continue; end if;
      -- Only a connection gets a typed invitation in the app; anyone else is a guest (SPEC §10 Connections).
      select p.user_id into found from public.profiles p
      where p.user_id <> me and p.deleted_at is null and public.are_connected(me, p.user_id)
        and ((p_email is not null and lower(p.email) = p_email)
          or (p_phone is not null and p.phone_verified and public.normalize_phone(p.phone) = public.normalize_phone(p_phone)))
      order by p.created_at
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
