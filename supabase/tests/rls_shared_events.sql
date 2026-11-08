-- Checks for shared events (SPEC §5 Shared events, Availability, Cancelling; §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  eve constant uuid := '33333333-3333-3333-3333-333333333333';
  party uuid;
  picnic uuid;
  r record;
  n int;
  bob_invite uuid;
  carol_invite uuid;
  carol_token text;
  dan_token text;
  bob_token text;
  t text;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{"full_name":"Alice Able"}', 'authenticated', 'authenticated'),
    (bob, 'bob@test.invalid', '{"full_name":"Bob Baker"}', 'authenticated', 'authenticated'),
    (eve, 'eve@test.invalid', '{"full_name":"Eve Hidden"}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id in (alice, bob, eve);
  update public.profiles set findable = false where user_id = eve;
  update public.profiles set phone = '+1 555 010 2000' where user_id = bob;
  insert into public.availability_rules (user_id, weekday, start_time, end_time) values (bob, 2, '09:00', '17:00');

  -- Cancellation messages start with the defaults from the spec.
  select count(*) into n from public.profiles where user_id = alice
    and cancel_event_message = 'Hi {{name}}, I''m sorry, but I have to cancel {{event}} on {{date}} at {{time}}. Sorry for the short notice!'
    and cancel_dropout_message like 'Hi {{name}}, I''m sorry, but I can''t make it to {{event}}%';
  if n <> 1 then raise exception 'FAIL: Spec §5 Cancelling: default cancellation messages are set up'; end if;

  insert into public.events (id, user_id, title, start_date, start_time, end_date, end_time)
    values (gen_random_uuid(), alice, 'Birthday party', '2026-11-20', '19:00', '2026-11-20', '22:00') returning id into party;
  insert into public.events (id, user_id, title, start_date, start_time, end_date, end_time)
    values (gen_random_uuid(), alice, 'Picnic', '2026-11-21', '12:00', '2026-11-21', '14:00') returning id into picnic;

  -- ===== As Alice (the host) =====
  -- Alice and Bob are connected, so they can invite each other in the app (SPEC §10 Connections).
  insert into public.connections (user_id, friend_id) values (alice, bob), (bob, alice);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  -- Name search: 3 letters, only findable people, only name and picture.
  select count(*) into n from public.search_people('Bo');
  if n <> 0 then raise exception 'FAIL: Spec §5: name search needs at least 3 letters'; end if;
  select count(*) into n from public.search_people('bob') s where s.user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §5: a findable user can be found by name'; end if;
  select count(*) into n from public.search_people('Eve');
  if n <> 0 then raise exception 'FAIL: Spec §5: people who turned off being findable are not found by name'; end if;

  -- Invite Bob by his email, Carol (a guest) by email, Dan (a guest) by phone. Every typed contact gets a link, so
  -- the host can't tell who has an account.
  for r in select * from public.invite_people(party, '[{"name":"Bob","email":"BOB@test.invalid"},{"name":"Carol","email":"carol@test.invalid"},{"name":"Dan","phone":"(555) 010-3000"}]'::jsonb) loop
    if r.token is null then raise exception 'FAIL: Spec §5: every invite by email or phone gets an answer link (no account is revealed)'; end if;
    if r.name = 'Bob' then bob_invite := r.invite_id; bob_token := r.token; end if;
    if r.name = 'Carol' then carol_invite := r.invite_id; carol_token := r.token; end if;
    if r.name = 'Dan' then dan_token := r.token; end if;
  end loop;
  select count(*) into n from public.event_invites where event_id = party;
  if n <> 3 then raise exception 'FAIL: Spec §5: the host sees the people invited (got %)', n; end if;
  select count(*) into n from public.invite_recipients;
  if n <> 0 then raise exception 'FAIL: Spec §5: the host can never see which invitees have accounts'; end if;
  begin
    perform recipient_user_id from public.outbound_messages limit 1;
    raise exception 'FAIL: Spec §5: the message log never shows the host whether a recipient is an app user';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.event_invites (event_id, name, email) values (party, 'Sneaky', 'x@test.invalid');
    raise exception 'FAIL: Spec §8: invitations are only made through the invite function';
  exception when insufficient_privilege then null;
  end;

  -- Limits: at most 25 people per event.
  begin
    perform public.invite_people(picnic, (select jsonb_agg(jsonb_build_object('email', 'g' || i || '@test.invalid')) from generate_series(1, 26) i));
    raise exception 'FAIL: Spec §5: at most 25 people per event';
  exception when invalid_parameter_value then null;
  end;

  -- Free/busy shows times, never titles; for findable people who share.
  select count(*) into n from public.free_busy(array[bob]) where kind = 'rule' and weekday = 2;
  if n <> 1 then raise exception 'FAIL: Spec §5 Availability: free/busy includes weekly unavailable times'; end if;
  select count(*) into n from public.free_busy(array[eve]);
  if n <> 0 then raise exception 'FAIL: Spec §5 Availability: free/busy is only for people allowed to be checked'; end if;
  execute 'reset role';

  -- What got queued: a push (and a waiting email, his preference) for Bob; waiting email/text for guests.
  select count(*) into n from public.outbound_messages where invite_id = bob_invite and channel = 'push' and status = 'queued' and recipient_user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §5: an invited app user gets a push notification'; end if;
  select count(*) into n from public.outbound_messages where invite_id = carol_invite and channel = 'email' and status = 'waiting';
  if n <> 1 then raise exception 'FAIL: Spec §5: guest emails are queued and logged until email sending is set up'; end if;
  select count(*) into n from public.outbound_messages where event_id = party and channel = 'text' and status = 'waiting' and recipient_name = 'Dan';
  if n <> 1 then raise exception 'FAIL: Spec §5: phone-only guests wait for my one-at-a-time sharing'; end if;

  -- ===== As Bob (an invited user) =====
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.events where id = party;
  if n <> 1 then raise exception 'FAIL: Spec §5: an invited user gets the event on their calendar'; end if;
  select count(*) into n from public.event_invites;
  if n <> 1 then raise exception 'FAIL: Spec §8: an invited user sees only their own invite'; end if;
  update public.events set title = 'Hacked' where id = party;
  select count(*) into n from public.event_people(party) where email is not null or phone is not null;
  if n <> 0 then raise exception 'FAIL: Spec §8: an invitee never sees other people''s contact details'; end if;
  perform public.respond_to_invite(bob_invite, 'no');
  select count(*) into n from public.message_event(party, 'everyone', 'Have fun without me!');
  if n <> 0 then raise exception 'FAIL: Spec §8: an invitee is never given other people''s contact details'; end if;
  begin
    perform public.cancel_event(party);
    raise exception 'FAIL: Spec §5: only the creator can cancel the event for everyone';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  select count(*) into n from public.events where id = party and title = 'Birthday party';
  if n <> 1 then raise exception 'FAIL: Spec §5: invited events are read-only for invitees'; end if;
  select count(*) into n from public.outbound_messages where kind = 'answer' and channel = 'push' and recipient_user_id = alice and body like 'Bob can''t make it to Birthday party%';
  if n <> 1 then raise exception 'FAIL: Spec §5: the creator is told when someone answers No'; end if;
  select count(*) into n from public.outbound_messages where kind = 'message' and invite_id = carol_invite and channel = 'email';
  if n <> 1 then raise exception 'FAIL: Spec §5: an invitee can message the other attendees (each individually)'; end if;

  -- ===== As a guest (no account), with the private link =====
  execute 'set local role anon';
  select count(*) into n from public.guest_invite(carol_invite, carol_token) where title = 'Birthday party' and host_name = 'Alice Able';
  if n <> 1 then raise exception 'FAIL: Spec §5: a guest''s link shows the event and who invited them'; end if;
  select count(*) into n from public.guest_invite(carol_invite, 'wrong');
  if n <> 0 then raise exception 'FAIL: Spec §8: a wrong link shows nothing'; end if;
  perform public.guest_respond(carol_invite, carol_token, 'yes');
  perform public.guest_opt_out(carol_invite, carol_token);
  begin
    perform public.invite_people(party, '[]'::jsonb);
    raise exception 'FAIL: Spec §8: signed-out visitors can only use the guest page';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  select count(*) into n from public.event_invites where id = carol_invite and response = 'yes';
  if n <> 1 then raise exception 'FAIL: Spec §5: a guest answers through their link'; end if;

  -- ===== Alice cancels: personal message for each person; opted-out guests are skipped =====
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  n := 0;
  for r in select * from public.cancel_event(party) loop
    n := n + 1;
    if r.name = 'Dan' and r.body <> 'Hi Dan, I''m sorry, but I have to cancel Birthday party on Friday, November 20 at 7:00 pm. Sorry for the short notice!' then
      raise exception 'FAIL: Spec §5 Cancelling: each message is personal, with the variables filled in (got %)', r.body;
    end if;
  end loop;
  -- Carol (yes) and Dan (pending) are returned for sharing; Bob said No so isn't told.
  if n <> 2 then raise exception 'FAIL: Spec §5 Cancelling: everyone still attached is notified (got %)', n; end if;
  execute 'reset role';
  select count(*) into n from public.events where id = party and cancelled_at is not null;
  if n <> 1 then raise exception 'FAIL: Spec §5 Cancelling: cancelling marks the event cancelled'; end if;
  select count(*) into n from public.outbound_messages where kind = 'cancel' and invite_id = carol_invite and status = 'skipped';
  if n <> 1 then raise exception 'FAIL: Spec §5: guests who opted out are not messaged'; end if;

  -- ===== Bob drops out of the picnic =====
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.invite_people(picnic, json_build_array(json_build_object('user_id', bob))::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.respond_to_invite((select i.id from public.event_invites i where i.event_id = picnic), 'yes');
  perform public.drop_out(picnic);
  execute 'reset role';
  select count(*) into n from public.outbound_messages where kind = 'dropout' and channel = 'push' and recipient_user_id = alice and body like 'Hi Alice Able, I''m sorry, but I can''t make it to Picnic%';
  if n <> 1 then raise exception 'FAIL: Spec §5 Cancelling: when I drop out, the host gets my personal message'; end if;

  -- ===== Deleting my account withdraws invitations I received =====
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.delete_my_account();
  execute 'reset role';
  select count(*) into n from public.event_invites where event_id = picnic and deleted_at is null;
  if n <> 0 then raise exception 'FAIL: Spec §8: deleting my account removes invitations I received'; end if;

  -- An all-day event's message has no "at {{time}}".
  select count(*) into n from public.events e
  where e.id = picnic and public.fill_message('See you on {{date}} at {{time}}!', 'Bob', (e.*)::public.events) = 'See you on Saturday, November 21 at 12:00 pm!';
  if n <> 1 then raise exception 'FAIL: Spec §5 Cancelling: times are filled in'; end if;
  update public.events set start_time = null, end_time = null where id = picnic;
  select count(*) into n from public.events e
  where e.id = picnic and public.fill_message('See you on {{date}} at {{time}}!', 'Bob', (e.*)::public.events) = 'See you on Saturday, November 21!';
  if n <> 1 then raise exception 'FAIL: Spec §5 Cancelling: an all-day event''s message leaves out the time'; end if;

  raise exception 'PASS: all shared event checks passed (test data rolled back)';
end
$$;
