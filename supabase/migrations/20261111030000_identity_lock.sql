-- Code review S1 and S3 (SPEC §8, §10 Connections).
--
-- profiles.email and profiles.phone_verified were ordinary owner-editable columns, yet connection requests,
-- invitations, "people with accounts" and guest-link claims use them to find a person. Anyone could set their
-- profile email to someone else's address and receive that person's requests and invitations.
--
-- 1. profiles.email is always the sign-in email (auth.users), whatever a client sends, so every function that
--    matches on it matches on the verified address.
-- 2. phone_verified can only be changed by the server (service role or migrations), never by the owner.
-- 3. Phone numbers only match an account once verified. Nobody can verify a phone yet, so typed phone numbers are
--    treated as guests (user's choice, 2026-11-11).
-- 4. shared_streaks() is dropped and "Everyone" is no longer a visibility choice: nobody sees another user unless
--    both agreed to connect (SPEC §10).

create or replace function public.lock_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := (select u.email from auth.users u where u.id = new.user_id);
  -- current_setting('role') is the caller's role even inside a security definer function.
  if current_setting('role', true) in ('authenticated', 'anon') then
    new.phone_verified := case when tg_op = 'UPDATE' then old.phone_verified else false end;
  end if;
  return new;
end;
$$;
revoke all on function public.lock_profile_identity() from public, anon, authenticated;

create trigger profiles_lock_identity
before insert or update on public.profiles
for each row execute function public.lock_profile_identity();

-- Put back the sign-in email on any profile whose copy was changed.
update public.profiles p set email = u.email
from auth.users u
where u.id = p.user_id and p.email is distinct from u.email;

-- Only a verified phone number finds an account.
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
      or (position('@' in typed) = 0 and p.phone_verified and public.normalize_phone(p.phone) = public.normalize_phone(typed)))
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
revoke all on function public.request_connection(text) from public, anon;
grant execute on function public.request_connection(text) to authenticated;

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

-- S3: nobody sees another user's streaks unless both agreed to connect; "Everyone" is gone.
drop function if exists public.shared_streaks();
update public.profiles set streak_visibility = 'approved' where streak_visibility = 'everyone';
alter table public.profiles
  add constraint profiles_no_everyone check (streak_visibility <> 'everyone') not valid;
