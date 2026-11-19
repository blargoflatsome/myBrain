-- ntfy and phone verification removed (SPEC §6, §5 Accounts and contact info; 2026-11-19, user).
--
-- Reminders, event news and connection pushes go out by Web Push only (plus the in-app bell). Phones are never
-- verified, so profiles.phone_verified goes and phone numbers simply never find an account (email only).
-- Profiles and notification_log are never kept on devices, so no device copies or waiting uploads name these columns.

-- 1. Senders without ntfy (latest bodies: send_due_reminders and send_outbound in 20261107040000_notifications_today,
--    send_connection_pushes in 20261117010000_cheers).
create or replace function public.send_due_reminders(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  p record;
  txt record;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';

  for r in select * from public.due_reminders(at) loop
    select * into p from public.profiles where user_id = r.user_id;
    select * into txt from public.reminder_text(r.kind, r.title, r.is_priority, r.detail);
    -- Kept for today's list on the Dashboard, whether or not it reaches a device (SPEC §6).
    perform public.record_notification(r.user_id, r.kind, r.item_id, txt.heading, txt.body, r.url, at);

    if p.notify_web_push and fn_url is not null and fn_secret is not null then
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
      from public.push_subscriptions s where s.user_id = r.user_id and s.deleted_at is null;
      if subs is not null then
        select net.http_post(
          url := fn_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
          body := jsonb_build_object(
            'subscriptions', subs,
            'payload', jsonb_build_object(
              'title', txt.heading,
              'body', txt.body,
              'url', r.url,
              'tag', r.kind || ':' || r.item_id,
              'priority', r.is_priority
            )
          )
        ) into req;
        insert into public.notification_log (user_id, kind, item_id, channel, request_id) values (r.user_id, r.kind, r.item_id, 'webpush', req);
      end if;
    end if;

    insert into public.reminder_state (user_id, kind, item_id, date, last_sent_at)
    values (r.user_id, r.kind, r.item_id, r.local_date, at)
    on conflict (kind, item_id, date) where deleted_at is null do update set last_sent_at = excluded.last_sent_at;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;


create or replace function public.send_outbound()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  m record;
  p record;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';
  for m in select * from public.outbound_messages o where o.status = 'queued' and o.channel = 'push' order by o.created_at limit 200 loop
    select * into p from public.profiles where user_id = m.recipient_user_id;
    perform public.record_notification(m.recipient_user_id, 'event_' || m.kind, m.id, coalesce(m.subject, 'My Brain'), m.body,
      '/calendar?event=' || coalesce(m.event_id::text, ''), now());
    select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
    from public.push_subscriptions s where s.user_id = m.recipient_user_id and s.deleted_at is null;
    if p.notify_web_push and subs is not null and fn_url is not null and fn_secret is not null then
      select net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
        body := jsonb_build_object('subscriptions', subs, 'payload', jsonb_build_object(
          'title', coalesce(m.subject, 'My Brain'), 'body', m.body, 'url', '/calendar?event=' || coalesce(m.event_id::text, ''),
          'tag', m.kind || ':' || coalesce(m.event_id::text, m.id::text), 'priority', false))
      ) into req;
    end if;
    update public.outbound_messages
    set status = case when (subs is not null and p.notify_web_push) then 'sent' else 'skipped' end,
        sent_at = now(),
        error = case when (subs is not null and p.notify_web_push) then null else 'no device set up for notifications' end
    where id = m.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;


create or replace function public.send_connection_pushes(at timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n record;
  p public.profiles;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';
  for n in
    select * from public.notifications x
    where x.pushed_at is null and x.deleted_at is null
      and x.kind in ('connection_request', 'connection_accepted', 'cheer_reactions', 'cheer_unstuck')
    order by x.created_at limit 200
  loop
    select * into p from public.profiles where user_id = n.user_id;
    if n.read_at is not null or n.created_at < at - interval '1 day' or p.user_id is null then
      update public.notifications set pushed_at = at where id = n.id;
      continue;
    end if;
    if public.in_quiet_hours(p, at) then continue; end if;
    if p.notify_web_push and fn_url is not null and fn_secret is not null then
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
      from public.push_subscriptions s where s.user_id = n.user_id and s.deleted_at is null;
      if subs is not null then
        select net.http_post(
          url := fn_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
          body := jsonb_build_object('subscriptions', subs, 'payload', jsonb_build_object(
            'title', n.title, 'body', n.body, 'url', n.url, 'tag', n.kind || ':' || coalesce(n.item_id::text, n.id::text),
            'priority', false))
        ) into req;
      end if;
    end if;
    update public.notifications set pushed_at = at where id = n.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;


-- 2. Matching people: email only (latest bodies: request_connection in 20261111030000_identity_lock, invite_people in
--    20261112060000_scheduler).
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


-- 3. The identity lock keeps only the sign-in email.
create or replace function public.lock_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := (select u.email from auth.users u where u.id = new.user_id);
  return new;
end;
$$;

-- 4. Drop the columns and the ntfy log rows.
alter table public.profiles
  drop column notify_ntfy,
  drop column ntfy_topic,
  drop column phone_verified;

delete from public.notification_log where channel = 'ntfy';
alter table public.notification_log drop constraint notification_log_channel_check;
alter table public.notification_log add constraint notification_log_channel_check check (channel = 'webpush');
