-- Checks for who's going and connecting through an event (SPEC §10 Connections, part 3). Always rolls back.
do $$
declare
  host  constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  eve   constant uuid := '44444444-4444-4444-4444-444444444444';
  ev    constant uuid := 'eeeeeeee-0000-4000-8000-000000000097';
  n int;
  bob_invite uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (host,  'host@test.invalid',  '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated'),
    (eve,   'eve@test.invalid',   '{}', 'authenticated', 'authenticated');
  update public.profiles set display_name = 'Hosty' where user_id = host;
  update public.profiles set display_name = 'Bob' where user_id = bob;
  update public.profiles set display_name = 'Carol' where user_id = carol;
  insert into public.connections (user_id, friend_id) values (host, bob), (bob, host), (host, carol), (carol, host);
  insert into public.events (id, user_id, title, start_date, end_date) values (ev, host, 'Picnic', current_date + 2, current_date + 2);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', host, 'role', 'authenticated')::text, true);
  perform public.invite_people(ev, '[{"user_id": "22222222-2222-2222-2222-222222222222"}, {"user_id": "33333333-3333-3333-3333-333333333333"}, {"name": "Dan Smith", "phone": "5550104000"}]'::jsonb);

  -- Bob sees the host, Carol (with Connect) and the guest by first name only.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.event_attendees(ev);
  if n <> 3 then raise exception 'FAIL: Spec §10: an attendee sees the host, other attendees and guests (got %)', n; end if;
  select count(*) into n from public.event_attendees(ev) where display_name = 'Carol' and can_connect;
  if n <> 1 then raise exception 'FAIL: Spec §10: other attendees I''m not connected with show Connect'; end if;
  select count(*) into n from public.event_attendees(ev) where display_name = 'Dan' and user_id is null and not can_connect;
  if n <> 1 then raise exception 'FAIL: Spec §10: guests show by first name only, with no way to contact them'; end if;

  -- Someone not at the event sees nothing and can't connect through it.
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated')::text, true);
  select count(*) into n from public.event_attendees(ev);
  if n <> 0 then raise exception 'FAIL: Spec §10: only people at the event see who''s going'; end if;
  begin
    perform public.connect_via_event(ev, carol);
    raise exception 'FAIL: Spec §10: someone not at the event can''t connect through it';
  exception when insufficient_privilege then null;
  end;

  -- Bob connects with Carol through the event; Carol gets the request.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.connect_via_event(ev, carol);
  select count(*) into n from public.event_attendees(ev) where display_name = 'Carol' and can_connect;
  if n <> 0 then raise exception 'FAIL: Spec §10: Connect goes away once asked'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.incoming_connection_requests() where display_name = 'Bob';
  if n <> 1 then raise exception 'FAIL: Spec §10: the request through an event reaches them'; end if;

  -- Carol hides herself: Bob no longer sees her.
  select i.id into bob_invite from public.event_invites i join public.invite_recipients r on r.invite_id = i.id where i.event_id = ev and r.user_id = carol;
  perform public.set_event_visibility(bob_invite, false);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.event_attendees(ev) where display_name = 'Carol';
  if n <> 0 then raise exception 'FAIL: Spec §10: an attendee can hide themselves from other attendees'; end if;

  -- The host turns off "show who's going": attendees see no one; the host still does.
  execute 'reset role';
  update public.events set show_guests = false where id = ev;
  execute 'set local role authenticated';
  select count(*) into n from public.event_attendees(ev);
  if n <> 0 then raise exception 'FAIL: Spec §10: the host can stop attendees seeing each other'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', host, 'role', 'authenticated')::text, true);
  select count(*) into n from public.event_attendees(ev);
  if n = 0 then raise exception 'FAIL: Spec §10: the host still sees who''s going'; end if;

  raise exception 'PASS: all who''s-going checks passed (test data rolled back)';
end
$$;
