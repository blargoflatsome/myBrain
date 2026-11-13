-- Scheduler (docs/SPEC.md §10 Connections, Scheduler): Show me as Busy or Free per event, tentative for Maybe,
-- unknown (not free) for anyone whose times I can't see, and optional people on an invitation.

-- 1. Show me as: null means the usual rule (timed events busy, all-day events free).
alter table public.events add column show_as text check (show_as in ('busy', 'free'));

-- 2. Optional people don't hold up a suggested time.
alter table public.event_invites add column optional boolean not null default false;

-- 3. free_busy: one 'shares' row per person whose times I can see (so anyone missing is unknown, never free),
--    a level for each busy row ('busy' or 'tentative'), Show me as on events, and my own times even if I don't share.
drop function if exists public.free_busy(uuid[]);
create function public.free_busy(people uuid[])
returns table (user_id uuid, timezone text, kind text, weekday smallint, start_date date, start_time time,
               end_date date, end_time time, repeat text, busy boolean, level text)
language sql stable security definer set search_path = '' as $$
  with allowed as (
    select p.user_id, p.timezone from public.profiles p
    where p.user_id = any (people) and p.deleted_at is null
      and (p.user_id = auth.uid() or (p.share_availability and public.are_connected(auth.uid(), p.user_id)))
  ),
  mine as (
    -- My events and events I said Yes or Maybe to, with how each shows.
    select e.user_id as owner, e.*, 'busy'::text as lvl from public.events e
    where e.deleted_at is null and e.cancelled_at is null
    union all
    select r.user_id, e.*, case when i.response = 'maybe' then 'tentative' else 'busy' end
    from public.invite_recipients r
    join public.event_invites i on i.id = r.invite_id and i.deleted_at is null and i.response in ('yes', 'maybe')
    join public.events e on e.id = i.event_id and e.deleted_at is null and e.cancelled_at is null
  )
  select a.user_id, a.timezone, 'shares', null::smallint, null::date, null::time, null::date, null::time, null::text, false, null::text
  from allowed a
  union all
  select a.user_id, a.timezone, 'rule', ar.weekday, null::date, ar.start_time, null::date, ar.end_time, null::text, true, 'busy'
  from allowed a join public.availability_rules ar on ar.user_id = a.user_id and ar.deleted_at is null
  union all
  select a.user_id, a.timezone, 'exception', null, x.date, x.start_time, x.date, x.end_time, null, x.kind = 'unavailable', 'busy'
  from allowed a join public.availability_exceptions x on x.user_id = a.user_id and x.deleted_at is null and x.date >= current_date - 1
  union all
  select a.user_id, a.timezone, 'event', null, m.start_date, m.start_time, m.end_date, m.end_time, m.repeat, true, m.lvl
  from allowed a join mine m on m.owner = a.user_id
  where coalesce(m.show_as = 'busy', m.start_time is not null);
$$;
revoke all on function public.free_busy(uuid[]) from public, anon;
grant execute on function public.free_busy(uuid[]) to authenticated;

-- 4. invite_people (latest in 20261112020000_profiles.sql) keeps whether each person is optional.
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
        and ((p_email is not null and lower(p.email) = p_email)
          or (p_phone is not null and p.phone_verified and public.normalize_phone(p.phone) = public.normalize_phone(p_phone)))
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

-- 5. The host can mark someone optional (or not) after inviting them.
create function public.set_invite_optional(invite uuid, value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.event_invites i set optional = value, updated_at = now()
  where i.id = invite and i.user_id = auth.uid() and i.deleted_at is null;
  if not found then raise exception 'Not your invitation' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.set_invite_optional(uuid, boolean) from public, anon;
grant execute on function public.set_invite_optional(uuid, boolean) to authenticated;

-- 6. event_people tells the host which connection each invitation is for (to check their times) and who's optional.
drop function if exists public.event_people(uuid);
create function public.event_people(event uuid)
returns table (invite_id uuid, name text, email text, phone text, response text, is_me boolean, user_id uuid, optional boolean)
language sql stable security definer set search_path = '' as $$
  select i.id, i.name,
         case when e.user_id = auth.uid() then i.email end,
         case when e.user_id = auth.uid() then i.phone end,
         i.response,
         exists (select 1 from public.invite_recipients r where r.invite_id = i.id and r.user_id = auth.uid()),
         case when e.user_id = auth.uid() then (select r.user_id from public.invite_recipients r where r.invite_id = i.id) end,
         i.optional
  from public.event_invites i join public.events e on e.id = i.event_id
  where i.event_id = event and i.deleted_at is null
    and (e.user_id = auth.uid() or exists (
      select 1 from public.event_invites mine join public.invite_recipients r on r.invite_id = mine.id
      where mine.event_id = event and r.user_id = auth.uid() and mine.deleted_at is null))
  order by i.created_at;
$$;
revoke all on function public.event_people(uuid) from public, anon;
grant execute on function public.event_people(uuid) to authenticated;
