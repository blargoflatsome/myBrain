-- Step 11: shared events, invitations and answers, availability, messages and cancellations
-- (docs/SPEC.md §4, §5 Accounts and contact info, Shared events and invitations, Availability schedule,
-- Cancelling an event or attendance, §8). Email sending is a Phase 2 step: emails are queued and logged here.

-- ---------- Profile settings ----------
alter table public.profiles
  add column findable boolean not null default true,
  add column share_availability boolean not null default true,
  add column cancel_dropout_message text not null
    default 'Hi {{name}}, I''m sorry, but I can''t make it to {{event}} on {{date}} at {{time}}. Sorry for the short notice!'
    check (length(cancel_dropout_message) between 1 and 1000),
  add column cancel_event_message text not null
    default 'Hi {{name}}, I''m sorry, but I have to cancel {{event}} on {{date}} at {{time}}. Sorry for the short notice!'
    check (length(cancel_event_message) between 1 and 1000);
alter table public.profiles add constraint profiles_phone_format check (phone is null or phone ~ '^\+?[0-9 ().-]{7,24}$');

-- Phone numbers are compared by their digits (and a leading +) only.
create or replace function public.normalize_phone(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g'), '');
$$;

-- ---------- Events: cancelled for everyone by the creator ----------
alter table public.events add column cancelled_at timestamptz;
alter table public.events add constraint events_id_user unique (id, user_id);

-- ---------- Invitations ----------
-- One per person invited. user_id is the host (the event's owner). Whether the person is an app user is kept in
-- invite_recipients, which the host can never read (SPEC §5: matching must not reveal that someone has an account).
create table public.event_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null,
  host_name text,
  name text check (name is null or length(name) <= 120),
  email text check (email is null or length(email) <= 320),
  phone text check (phone is null or length(phone) <= 40),
  response text not null default 'pending' check (response in ('pending', 'yes', 'maybe', 'no', 'dropped')),
  responded_at timestamptz,
  -- A guest's private answer link: only its hash is kept.
  token_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade
);
create index event_invites_event_idx on public.event_invites (event_id);

create table public.invite_recipients (
  invite_id uuid primary key references public.event_invites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index invite_recipients_user_idx on public.invite_recipients (user_id);

-- ---------- Availability ----------
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  -- No times = the whole day.
  start_time time,
  end_time time,
  kind text not null default 'unavailable' check (kind in ('unavailable', 'available')),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time)
);

-- ---------- Messages to people, and opt-outs ----------
create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid,
  invite_id uuid,
  recipient_user_id uuid references auth.users (id) on delete cascade,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  channel text not null check (channel in ('email', 'push', 'text')),
  kind text not null check (kind in ('invite', 'answer', 'message', 'cancel', 'dropout')),
  subject text,
  body text not null,
  -- waiting = needs email sending (Phase 2) or my one-at-a-time sharing; skipped = opted out or no device.
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped', 'waiting')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index outbound_messages_queue_idx on public.outbound_messages (status, channel) where status = 'queued';
create index outbound_messages_sender_idx on public.outbound_messages (user_id, created_at);

create table public.message_optouts (
  address_hash text primary key,
  created_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
do $$
declare
  t text;
begin
  foreach t in array array['event_invites', 'availability_rules', 'availability_exceptions', 'outbound_messages'] loop
    execute format('create trigger %1$s_set_updated_at before insert or update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create index %1$s_user_updated_idx on public.%1$I (user_id, updated_at)', t);
  end loop;
  foreach t in array array['availability_rules', 'availability_exceptions'] loop
    execute format('create policy "%1$s: owner can read" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s: owner can update" on public.%1$I for update to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['event_invites', 'availability_rules', 'availability_exceptions'] loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end
$$;

alter table public.invite_recipients enable row level security;
revoke all on public.invite_recipients from anon, authenticated;
alter table public.message_optouts enable row level security;
revoke all on public.message_optouts from anon, authenticated;

-- Invitations: the host reads their own; an invited user reads only their own invite. Changes go through the
-- functions below, never direct writes.
create policy "event_invites: host can read" on public.event_invites for select to authenticated
  using (user_id = (select auth.uid()));
create policy "event_invites: invitee can read own" on public.event_invites for select to authenticated
  using (exists (select 1 from public.invite_recipients r where r.invite_id = event_invites.id and r.user_id = (select auth.uid())));
revoke insert, update, delete on public.event_invites from authenticated;
grant select on public.event_invites to authenticated;

-- Invited users can read the events they were invited to (read-only; only the owner can change them).
create policy "events: invitee can read" on public.events for select to authenticated
  using (exists (
    select 1 from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
    where i.event_id = events.id and r.user_id = (select auth.uid()) and i.deleted_at is null
  ));

-- The message log: I can read what I sent, but never whether a recipient is an app user.
create policy "outbound_messages: sender can read" on public.outbound_messages for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.outbound_messages from authenticated;
grant select (id, user_id, event_id, invite_id, recipient_name, recipient_email, recipient_phone, channel, kind, subject, body, status, error, sent_at, created_at, updated_at)
  on public.outbound_messages to authenticated;

-- ---------- Helpers ----------
create or replace function public.event_when(e public.events)
returns table (date_text text, time_text text) language sql stable set search_path = '' as $$
  select to_char(e.start_date, 'FMDay, FMMonth FMDD'),
         case when e.start_time is null then 'all day' else to_char(e.start_time, 'FMHH12:MI am') end;
$$;

-- Fill {{name}}, {{event}}, {{date}}, {{time}} for one recipient.
create or replace function public.fill_message(template text, recipient text, e public.events)
returns text language sql stable set search_path = '' as $$
  select replace(replace(replace(replace(template,
    '{{name}}', coalesce(nullif(trim(recipient), ''), 'there')),
    '{{event}}', e.title),
    '{{date}}', (select w.date_text from public.event_when(e) w)),
    '{{time}}', (select w.time_text from public.event_when(e) w));
$$;

create or replace function public.address_hash(address text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(lower(trim(address)), 'sha256'), 'hex');
$$;

-- Queue one message to one person: app users get a push; email and text wait (email sending is Phase 2; texts use
-- my one-at-a-time sharing). Opted-out addresses are skipped. Never reveals anything to the sender.
create or replace function public.queue_message(
  sender uuid, ev uuid, inv uuid, to_user uuid, to_name text, to_email text, to_phone text,
  msg_kind text, msg_subject text, msg_body text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  pref public.event_notify_method;
begin
  if to_user is not null then
    insert into public.outbound_messages (user_id, event_id, invite_id, recipient_user_id, recipient_name, channel, kind, subject, body)
    values (sender, ev, inv, to_user, to_name, 'push', msg_kind, msg_subject, msg_body);
    select p.event_notify_method into pref from public.profiles p where p.user_id = to_user;
    if pref in ('email', 'both') then
      insert into public.outbound_messages (user_id, event_id, invite_id, recipient_user_id, recipient_name, channel, kind, subject, body, status)
      select sender, ev, inv, to_user, to_name, 'email', msg_kind, msg_subject, msg_body, 'waiting'
      from public.profiles p where p.user_id = to_user and p.email is not null;
    end if;
    return;
  end if;
  if to_email is not null then
    insert into public.outbound_messages (user_id, event_id, invite_id, recipient_name, recipient_email, channel, kind, subject, body, status)
    values (sender, ev, inv, to_name, to_email, 'email', msg_kind, msg_subject, msg_body,
            case when exists (select 1 from public.message_optouts o where o.address_hash = public.address_hash(to_email)) then 'skipped' else 'waiting' end);
  elsif to_phone is not null then
    insert into public.outbound_messages (user_id, event_id, invite_id, recipient_name, recipient_phone, channel, kind, subject, body, status)
    values (sender, ev, inv, to_name, to_phone, 'text', msg_kind, msg_subject, msg_body,
            case when exists (select 1 from public.message_optouts o where o.address_hash = public.address_hash(public.normalize_phone(to_phone))) then 'skipped' else 'waiting' end);
  end if;
end;
$$;

-- Messages sent to other people today by a user (for rate limits).
create or replace function public.messages_today(sender uuid, kinds text[])
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct coalesce(invite_id::text, id::text))::int from public.outbound_messages
  where user_id = sender and kind = any (kinds) and created_at > now() - interval '1 day';
$$;

-- ---------- Finding people ----------
-- By name: at least 3 letters, only people who allow it, only their name and picture (SPEC §5).
create or replace function public.search_people(q text)
returns table (user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.avatar_url
  from public.profiles p
  where length(trim(q)) >= 3 and p.findable and p.deleted_at is null and p.user_id <> auth.uid()
    and p.display_name ilike '%' || replace(replace(trim(q), '%', ''), '_', '') || '%'
  order by p.display_name
  limit 10;
$$;

-- ---------- Inviting ----------
-- people: [{ "user_id"?: uuid (from search), "name"?: text, "email"?: text, "phone"?: text }]
-- Returns each new invite with its answer link token for my sharing flow (people found by name need no link).
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
      from public.profiles p where p.user_id = (person ->> 'user_id')::uuid and p.findable and p.user_id <> me;
      if found is null then continue; end if;
      p_email := null;
      p_phone := null;
    else
      if p_email is null and p_phone is null then continue; end if;
      select p.user_id into found from public.profiles p
      where p.user_id <> me and p.deleted_at is null
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

-- Remove someone from my event (no message is sent).
create or replace function public.uninvite(invite uuid)
returns void language sql security definer set search_path = '' as $$
  update public.event_invites set deleted_at = now() where id = invite and user_id = auth.uid() and deleted_at is null;
$$;

-- A new answer link for a guest, e.g. to share again (the old one stops working).
create or replace function public.new_invite_link(invite uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  tok text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  update public.event_invites set token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')
  where id = invite and user_id = auth.uid() and deleted_at is null and (email is not null or phone is not null);
  if not found then raise exception 'Not your invite' using errcode = '42501'; end if;
  return tok;
end;
$$;

-- ---------- Answering ----------
create or replace function public.record_answer(inv public.event_invites, answer text, answerer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  w record;
  who text := coalesce(inv.name, 'Someone');
begin
  update public.event_invites set response = answer, responded_at = now() where id = inv.id;
  if answer = 'no' and inv.response <> 'no' then
    select * into ev from public.events e where e.id = inv.event_id;
    select * into w from public.event_when(ev);
    perform public.queue_message(coalesce(answerer, inv.user_id), ev.id, inv.id, inv.user_id, inv.host_name, null, null, 'answer',
      who || ' can''t make it', who || ' can''t make it to ' || ev.title || ' on ' || w.date_text || '.');
  end if;
end;
$$;
revoke execute on function public.record_answer(public.event_invites, text, uuid) from public, anon, authenticated;

create or replace function public.respond_to_invite(invite uuid, answer text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.event_invites;
begin
  if answer not in ('yes', 'maybe', 'no') then raise exception 'Answer yes, maybe or no' using errcode = '22023'; end if;
  select i.* into inv from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
  where i.id = invite and r.user_id = auth.uid() and i.deleted_at is null;
  if inv.id is null then raise exception 'Not your invite' using errcode = '42501'; end if;
  perform public.record_answer(inv, answer, auth.uid());
end;
$$;

-- ---------- Guest answer page (no account; works with the private link) ----------
create or replace function public.guest_invite_row(invite uuid, token text)
returns public.event_invites language sql stable security definer set search_path = '' as $$
  select i.* from public.event_invites i
  where i.id = invite and i.deleted_at is null and i.token_hash is not null
    and i.token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex');
$$;
revoke execute on function public.guest_invite_row(uuid, text) from public, anon, authenticated;

create or replace function public.guest_invite(invite uuid, token text)
returns table (host_name text, guest_name text, title text, notes text, start_date date, start_time time, end_date date, end_time time,
               repeat text, timezone text, response text, cancelled boolean)
language sql stable security definer set search_path = '' as $$
  select i.host_name, i.name, e.title, e.notes, e.start_date, e.start_time, e.end_date, e.end_time, e.repeat, p.timezone, i.response,
         e.cancelled_at is not null
  from public.guest_invite_row(invite, token) i
  join public.events e on e.id = i.event_id and e.deleted_at is null
  join public.profiles p on p.user_id = e.user_id;
$$;

create or replace function public.guest_respond(invite uuid, token text, answer text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.event_invites := public.guest_invite_row(invite, token);
begin
  if inv.id is null then raise exception 'This link no longer works' using errcode = '42501'; end if;
  if answer not in ('yes', 'maybe', 'no') then raise exception 'Answer yes, maybe or no' using errcode = '22023'; end if;
  perform public.record_answer(inv, answer, null);
end;
$$;

create or replace function public.guest_message(invite uuid, token text, message text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.event_invites := public.guest_invite_row(invite, token);
  ev public.events;
begin
  if inv.id is null then raise exception 'This link no longer works' using errcode = '42501'; end if;
  if length(trim(coalesce(message, ''))) = 0 or length(message) > 2000 then raise exception 'Write a message (up to 2000 characters)' using errcode = '22023'; end if;
  if (select count(*) from public.outbound_messages o where o.invite_id = inv.id and o.kind = 'message' and o.created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many messages today' using errcode = '22023';
  end if;
  select * into ev from public.events e where e.id = inv.event_id;
  perform public.queue_message(inv.user_id, ev.id, inv.id, inv.user_id, inv.host_name, null, null, 'message',
    coalesce(inv.name, 'A guest') || ' about ' || ev.title, trim(message));
end;
$$;

create or replace function public.guest_opt_out(invite uuid, token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.event_invites := public.guest_invite_row(invite, token);
begin
  if inv.id is null then raise exception 'This link no longer works' using errcode = '42501'; end if;
  if inv.email is not null then
    insert into public.message_optouts (address_hash) values (public.address_hash(inv.email)) on conflict do nothing;
  end if;
  if inv.phone is not null then
    insert into public.message_optouts (address_hash) values (public.address_hash(public.normalize_phone(inv.phone))) on conflict do nothing;
  end if;
end;
$$;

-- ---------- Who is on an event (names and answers; contact details only for the host) ----------
create or replace function public.event_people(event uuid)
returns table (invite_id uuid, name text, email text, phone text, response text, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select i.id, i.name,
         case when e.user_id = auth.uid() then i.email end,
         case when e.user_id = auth.uid() then i.phone end,
         i.response,
         exists (select 1 from public.invite_recipients r where r.invite_id = i.id and r.user_id = auth.uid())
  from public.event_invites i join public.events e on e.id = i.event_id
  where i.event_id = event and i.deleted_at is null
    and (e.user_id = auth.uid() or exists (
      select 1 from public.event_invites mine join public.invite_recipients r on r.invite_id = mine.id
      where mine.event_id = event and r.user_id = auth.uid() and mine.deleted_at is null))
  order by i.created_at;
$$;

-- ---------- Messages from an invitee or the host ----------
-- audience: 'host' or 'everyone'. Returns, for the host only, the people to reach one at a time (email or phone).
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
  if public.messages_today(me, array['message']) >= 50 then raise exception 'At most 50 messages a day' using errcode = '22023'; end if;
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

-- ---------- Cancelling ----------
-- The creator cancels for everyone, with their own message filled in for each person. Returns the people to reach
-- one at a time (guests with an email or phone number), with their personal message.
create or replace function public.cancel_event(event uuid)
returns table (invite_id uuid, name text, email text, phone text, body text)
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev public.events;
  template text;
  inv record;
  msg text;
begin
  select * into ev from public.events e where e.id = event and e.user_id = me and e.deleted_at is null;
  if ev.id is null then raise exception 'Not your event' using errcode = '42501'; end if;
  if ev.cancelled_at is not null then return; end if;
  update public.events set cancelled_at = now() where id = event;
  select p.cancel_event_message into template from public.profiles p where p.user_id = me;
  for inv in
    select i.*, r.user_id as recipient from public.event_invites i left join public.invite_recipients r on r.invite_id = i.id
    where i.event_id = event and i.deleted_at is null and i.response not in ('no', 'dropped')
  loop
    msg := public.fill_message(template, inv.name, ev);
    perform public.queue_message(me, ev.id, inv.id, inv.recipient, inv.name, inv.email, inv.phone, 'cancel', ev.title || ' is cancelled', msg);
    if inv.email is not null or inv.phone is not null then
      invite_id := inv.id; name := inv.name; email := inv.email; phone := inv.phone; body := msg;
      return next;
    end if;
  end loop;
end;
$$;

-- An attendee drops out: the host and the other attendees are told (app users by push; emails are queued).
create or replace function public.drop_out(event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev public.events;
  mine public.event_invites;
  template text;
  inv record;
begin
  select * into ev from public.events e where e.id = event and e.deleted_at is null;
  select i.* into mine from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
  where i.event_id = event and r.user_id = me and i.deleted_at is null;
  if ev.id is null or mine.id is null then raise exception 'Not your event' using errcode = '42501'; end if;
  if mine.response = 'dropped' then return; end if;
  update public.event_invites set response = 'dropped', responded_at = now() where id = mine.id;
  select p.cancel_dropout_message into template from public.profiles p where p.user_id = me;
  perform public.queue_message(me, ev.id, mine.id, ev.user_id, mine.host_name, null, null, 'dropout', 'Change of plans', public.fill_message(template, mine.host_name, ev));
  for inv in
    select i.*, r.user_id as recipient from public.event_invites i left join public.invite_recipients r on r.invite_id = i.id
    where i.event_id = event and i.deleted_at is null and i.id <> mine.id and i.response not in ('no', 'dropped')
  loop
    perform public.queue_message(me, ev.id, inv.id, inv.recipient, inv.name, inv.email, inv.phone, 'dropout', 'Change of plans', public.fill_message(template, inv.name, ev));
  end loop;
end;
$$;

-- After my one-at-a-time sharing, mark those waiting messages as sent by me.
create or replace function public.mark_shared(invites uuid[], msg_kind text)
returns void language sql security definer set search_path = '' as $$
  update public.outbound_messages set status = 'sent', sent_at = now(), error = 'shared by the sender'
  where user_id = auth.uid() and invite_id = any (invites) and kind = msg_kind and status = 'waiting';
$$;

-- ---------- Free/busy for availability checks (never titles or details) ----------
-- For people who share their availability and are findable or invited to one of my events: their weekly
-- unavailable times, exceptions, and the times of their events (own and accepted), plus their timezone.
create or replace function public.free_busy(people uuid[])
returns table (user_id uuid, timezone text, kind text, weekday smallint, start_date date, start_time time,
               end_date date, end_time time, repeat text, busy boolean)
language sql stable security definer set search_path = '' as $$
  with allowed as (
    select p.user_id, p.timezone from public.profiles p
    where p.user_id = any (people) and p.share_availability and p.deleted_at is null
      and (p.user_id = auth.uid() or p.findable or exists (
        select 1 from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
        where i.user_id = auth.uid() and r.user_id = p.user_id and i.deleted_at is null))
  )
  select a.user_id, a.timezone, 'rule', ar.weekday, null::date, ar.start_time, null::date, ar.end_time, null::text, true
  from allowed a join public.availability_rules ar on ar.user_id = a.user_id and ar.deleted_at is null
  union all
  select a.user_id, a.timezone, 'exception', null, x.date, x.start_time, x.date, x.end_time, null, x.kind = 'unavailable'
  from allowed a join public.availability_exceptions x on x.user_id = a.user_id and x.deleted_at is null and x.date >= current_date - 1
  union all
  select a.user_id, a.timezone, 'event', null, e.start_date, e.start_time, e.end_date, e.end_time, e.repeat, true
  from allowed a join public.events e on e.user_id = a.user_id and e.deleted_at is null and e.cancelled_at is null
  union all
  select a.user_id, a.timezone, 'event', null, e.start_date, e.start_time, e.end_date, e.end_time, e.repeat, true
  from allowed a
  join public.invite_recipients r on r.user_id = a.user_id
  join public.event_invites i on i.id = r.invite_id and i.deleted_at is null and i.response in ('yes', 'maybe')
  join public.events e on e.id = i.event_id and e.deleted_at is null and e.cancelled_at is null;
$$;

-- ---------- Sending: push (and ntfy) to app users, from the once-a-minute job ----------
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
  app_url constant text := 'https://myadhdbrain.netlify.app';
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';
  for m in select * from public.outbound_messages o where o.status = 'queued' and o.channel = 'push' order by o.created_at limit 200 loop
    select * into p from public.profiles where user_id = m.recipient_user_id;
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
    if p.notify_ntfy and p.ntfy_topic is not null and length(p.ntfy_topic) >= 16 then
      select net.http_post(url := 'https://ntfy.sh', body := jsonb_build_object(
        'topic', p.ntfy_topic, 'title', coalesce(m.subject, 'My Brain'), 'message', m.body, 'priority', 3,
        'click', app_url || '/calendar?event=' || coalesce(m.event_id::text, ''))) into req;
    end if;
    update public.outbound_messages
    set status = case when (subs is not null and p.notify_web_push) or (p.notify_ntfy and p.ntfy_topic is not null) then 'sent' else 'skipped' end,
        sent_at = now(),
        error = case when (subs is not null and p.notify_web_push) or (p.notify_ntfy and p.ntfy_topic is not null) then null else 'no device set up for notifications' end
    where id = m.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke execute on function public.send_outbound() from public, anon, authenticated;
select cron.schedule('my-brain-outbound', '* * * * *', 'select public.send_outbound()');

-- ---------- Account deletion also withdraws invitations I received ----------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  update public.event_invites i set deleted_at = now(), response = 'dropped'
  from public.invite_recipients r where r.invite_id = i.id and r.user_id = me and i.deleted_at is null;
  delete from auth.users where id = me;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- Who may call what ----------
revoke execute on function public.queue_message(uuid, uuid, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.messages_today(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.search_people(text), public.invite_people(uuid, jsonb), public.uninvite(uuid), public.new_invite_link(uuid),
  public.respond_to_invite(uuid, text), public.event_people(uuid), public.message_event(uuid, text, text), public.cancel_event(uuid),
  public.drop_out(uuid), public.mark_shared(uuid[], text), public.free_busy(uuid[]) from public, anon;
grant execute on function public.search_people(text), public.invite_people(uuid, jsonb), public.uninvite(uuid), public.new_invite_link(uuid),
  public.respond_to_invite(uuid, text), public.event_people(uuid), public.message_event(uuid, text, text), public.cancel_event(uuid),
  public.drop_out(uuid), public.mark_shared(uuid[], text), public.free_busy(uuid[]) to authenticated;
-- The guest page works without an account, with the private link.
revoke execute on function public.guest_invite(uuid, text), public.guest_respond(uuid, text, text), public.guest_message(uuid, text, text),
  public.guest_opt_out(uuid, text) from public;
grant execute on function public.guest_invite(uuid, text), public.guest_respond(uuid, text, text), public.guest_message(uuid, text, text),
  public.guest_opt_out(uuid, text) to anon, authenticated;
