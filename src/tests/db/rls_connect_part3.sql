-- Checks for connecting from my people and from a guest invitation (SPEC §10 Connections, part 3). Always rolls back.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  ev    constant uuid := 'eeeeeeee-0000-4000-8000-000000000098';
  inv record;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set email = 'alice@test.invalid', display_name = 'Alice' where user_id = alice;
  update public.profiles set email = 'carol@test.invalid', display_name = 'Carol' where user_id = carol;
  insert into public.people (user_id, name, email) values (alice, 'Carol', 'CAROL@test.invalid'), (alice, 'Nobody', 'nobody@test.invalid');
  insert into public.events (id, user_id, title, start_date, end_date) values (ev, alice, 'Picnic', current_date + 2, current_date + 2);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.people_with_accounts();
  if n <> 1 then raise exception 'FAIL: Spec §10: only saved people with accounts show Connect (got %)', n; end if;
  perform public.request_connection('carol@test.invalid');
  select count(*) into n from public.people_with_accounts();
  if n <> 0 then raise exception 'FAIL: Spec §10: someone I already asked doesn''t show Connect again'; end if;

  -- A saved person who is a connection shows once in Contacts: matched by email, or by phone in any format.
  execute 'reset role';
  insert into public.connections (user_id, friend_id) values (alice, carol);
  update public.profiles set phone = '+1 (509) 434-8303' where user_id = carol;
  insert into public.people (user_id, name, phone) values (alice, 'Carol again', '5094348303'), (alice, 'Short', '434');
  execute 'set local role authenticated';
  select count(*) into n from public.people_who_are_connections() where friend_id = carol;
  if n <> 2 then raise exception 'FAIL: Spec §5 Contacts: saved people who are connections are matched by email and phone (got %)', n; end if;
  execute 'reset role';
  delete from public.connections where user_id = alice and friend_id = carol;
  execute 'set local role authenticated';
  select count(*) into n from public.people_who_are_connections();
  if n <> 0 then raise exception 'FAIL: Spec §5 Contacts: only connections hide a saved person'; end if;

  -- Carol, invited as a guest (not connected), is offered to connect with the host after opening her link.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select * into inv from public.invite_people(ev, '[{"email": "carol@test.invalid", "name": "Carol"}]'::jsonb);
  if inv.token is null then raise exception 'FAIL: Spec §10: an account holder who isn''t a connection is invited as a guest'; end if;
  if public.guest_connect_offer(inv.invite_id, inv.token) then raise exception 'FAIL: Spec §10: the host isn''t offered to connect with themselves'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  -- Alice already asked Carol, so Carol answers that instead; clear it to test the guest offer on its own.
  execute 'reset role';
  delete from public.connection_requests;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  if not public.guest_connect_offer(inv.invite_id, inv.token) then raise exception 'FAIL: Spec §10: a signed-in guest with an account is offered to connect with the host'; end if;
  perform public.guest_connect_with_host(inv.invite_id, inv.token);
  if public.guest_connect_offer(inv.invite_id, inv.token) then raise exception 'FAIL: Spec §10: the offer goes away once asked'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.incoming_connection_requests() where display_name = 'Carol';
  if n <> 1 then raise exception 'FAIL: Spec §10: the host gets the guest''s request and still has to accept'; end if;
  select count(*) into n from public.my_connections();
  if n <> 0 then raise exception 'FAIL: Spec §10: a guest isn''t connected until the host accepts'; end if;
  begin
    perform public.guest_connect_with_host(inv.invite_id, 'wrong-token');
    raise exception 'FAIL: Spec §10: a wrong guest link can''t send a request';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all connect-from-people and guest checks passed (test data rolled back)';
end
$$;
