-- Checks for guest links and their edge cases (SPEC §10 Connections, part 4). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  dave  constant uuid := '44444444-4444-4444-4444-444444444444';
  ev    constant uuid := 'eeeeeeee-0000-4000-8000-000000000096';
  old   constant uuid := 'eeeeeeee-0000-4000-8000-000000000095';
  c record;
  b record;
  o record;
  req uuid;
  n int;
  passed boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated'),
    (dave,  'dave@test.invalid',  '{}', 'authenticated', 'authenticated');
  update public.profiles set email = 'alice@test.invalid', display_name = 'Alice' where user_id = alice;
  update public.profiles set email = 'bob@test.invalid', display_name = 'Bob' where user_id = bob;
  update public.profiles set email = 'carol@test.invalid', display_name = 'Carol' where user_id = carol;
  update public.profiles set email = 'dave@test.invalid', display_name = 'Dave' where user_id = dave;
  insert into public.events (id, user_id, title, start_date, end_date) values
    (ev, alice, 'Picnic', current_date + 2, current_date + 2),
    (old, alice, 'Old party', current_date - 40, current_date - 40);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select * into c from public.invite_people(ev, '[{"email": "carol@test.invalid", "name": "Carol"}]'::jsonb);
  select * into b from public.invite_people(ev, '[{"email": "bob@test.invalid", "name": "Bob"}]'::jsonb);
  select * into o from public.invite_people(old, '[{"email": "guest@test.invalid", "name": "Gus"}]'::jsonb);
  if public.guest_claim_status(c.invite_id, c.token) <> 'none' then raise exception 'FAIL: Spec §10: the host can''t claim their own invitation'; end if;

  -- Link lifetime: 30 days after the event the page says it has passed, and nothing can be changed.
  execute 'reset role';
  select g.passed into passed from public.guest_invite(o.invite_id, o.token) g;
  if not passed then raise exception 'FAIL: Spec §10: a guest link says the event has passed 30 days after it'; end if;
  begin
    perform public.guest_respond(o.invite_id, o.token, 'yes');
    raise exception 'FAIL: Spec §10: an expired guest link can''t change the answer';
  exception when insufficient_privilege then null;
  end;
  select g.passed into passed from public.guest_invite(c.invite_id, c.token) g;
  if passed then raise exception 'FAIL: Spec §10: an upcoming event''s link still works'; end if;

  -- Carol's account has the invited email: it moves into her account.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  if public.guest_claim_status(c.invite_id, c.token) <> 'match' then raise exception 'FAIL: Spec §10: a matching email moves the invitation in'; end if;
  if not public.claim_guest_invite(c.invite_id, c.token) then raise exception 'FAIL: Spec §10: claiming works'; end if;
  if public.guest_claim_status(c.invite_id, c.token) <> 'claimed' then raise exception 'FAIL: Spec §10: a claimed invitation says so'; end if;
  execute 'reset role';
  select count(*) into n from public.invite_recipients where invite_id = c.invite_id and user_id = carol;
  if n <> 1 then raise exception 'FAIL: Spec §10: the claimed invitation is in Carol''s account'; end if;

  -- Dave opens Carol's... no: Dave opens Bob's forwarded link, signed in with a different email: he's asked first.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', dave, 'role', 'authenticated')::text, true);
  if public.guest_claim_status(b.invite_id, b.token) <> 'ask' then raise exception 'FAIL: Spec §10: a different email is asked "Accept as me?"'; end if;

  -- Alice and Bob connect: Bob's guest invitation moves into the app.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.request_connection('bob@test.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select id into req from public.incoming_connection_requests() limit 1;
  perform public.answer_connection_request(req, 'accept');
  execute 'reset role';
  select count(*) into n from public.invite_recipients where invite_id = b.invite_id and user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §10: once connected, earlier guest invitations move into the app'; end if;

  -- The host changes the event and lets everyone know: app users get a push; guests come back for one-at-a-time messages.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.invite_people(ev, '[{"phone": "5550109000", "name": "Pat"}]'::jsonb);
  select count(*) into n from public.event_changed(ev);
  if n <> 1 then raise exception 'FAIL: Spec §10: guests (not app users) come back to be messaged (got %)', n; end if;
  execute 'reset role';
  select count(*) into n from public.outbound_messages where event_id = ev and kind = 'update' and channel = 'push';
  if n <> 2 then raise exception 'FAIL: Spec §10: app users at the event get a change notice push (got %)', n; end if;
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
    perform public.event_changed(ev);
    raise exception 'FAIL: Spec §10: only the host sends change notices';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all guest link checks passed (test data rolled back)';
end
$$;
