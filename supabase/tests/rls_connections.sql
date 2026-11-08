-- Checks for Connections, part 1 (SPEC §10 Connections). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  ev    constant uuid := 'eeeeeeee-0000-4000-8000-000000000099';
  req uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set email = 'alice@test.invalid', display_name = 'Alice' where user_id = alice;
  update public.profiles set email = 'bob@test.invalid', phone = '(555) 010-2000', display_name = 'Bob' where user_id = bob;
  update public.profiles set email = 'carol@test.invalid', display_name = 'Carol' where user_id = carol;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  begin
    perform 1 from public.connection_requests;
    raise exception 'FAIL: Spec §10: clients cannot read connection requests directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.connections (user_id, friend_id) values (alice, bob);
    raise exception 'FAIL: Spec §10: clients cannot make connections directly';
  exception when insufficient_privilege then null;
  end;

  -- Asking never reveals whether an account exists: both calls just succeed, and both show as Sent.
  perform public.request_connection('BOB@test.invalid');
  perform public.request_connection('nobody@test.invalid');
  select count(*) into n from public.sent_connection_requests();
  if n <> 2 then raise exception 'FAIL: Spec §10: every request I send shows as Sent, account or not (got %)', n; end if;
  perform public.request_connection('bob@test.invalid');
  select count(*) into n from public.sent_connection_requests();
  if n <> 2 then raise exception 'FAIL: Spec §10: asking the same address again doesn''t send twice'; end if;

  -- An app user can't be invited in the app before we're connected, even by typing their email: they're a guest.
  insert into public.events (id, user_id, title, start_date, end_date) values (ev, alice, 'Party', current_date + 3, current_date + 3);
  perform public.invite_people(ev, '[{"email": "bob@test.invalid", "name": "Bob"}, {"user_id": "22222222-2222-2222-2222-222222222222"}]'::jsonb);
  execute 'reset role';
  select count(*) into n from public.invite_recipients r join public.event_invites i on i.id = r.invite_id where i.event_id = ev;
  if n <> 0 then raise exception 'FAIL: Spec §10: before connecting, a typed email is a guest invite and an id invite is refused'; end if;
  select count(*) into n from public.notifications where user_id = bob and kind = 'connection_request';
  if n <> 1 then raise exception 'FAIL: Spec §10: the person asked gets the request in their notifications'; end if;

  -- Bob sees the request, Carol doesn't; Bob accepts.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.incoming_connection_requests();
  if n <> 0 then raise exception 'FAIL: Spec §10: only the person asked sees a request'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select id into req from public.incoming_connection_requests() limit 1;
  if req is null then raise exception 'FAIL: Spec §10: the person asked sees the request'; end if;
  perform public.answer_connection_request(req, 'accept');
  select count(*) into n from public.my_connections();
  if n <> 1 then raise exception 'FAIL: Spec §10: accepting connects us'; end if;

  -- Now connected: Alice can invite Bob in the app.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.my_connections() where display_name = 'Bob';
  if n <> 1 then raise exception 'FAIL: Spec §10: both sides see the connection'; end if;
  perform public.invite_people(ev, '[{"user_id": "22222222-2222-2222-2222-222222222222"}]'::jsonb);
  execute 'reset role';
  select count(*) into n from public.invite_recipients r join public.event_invites i on i.id = r.invite_id where i.event_id = ev and r.user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §10: connections can be invited in the app'; end if;

  -- Removing ends it on both sides; blocking stops new requests silently.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.remove_connection(alice, true);
  select count(*) into n from public.my_connections();
  if n <> 0 then raise exception 'FAIL: Spec §10: removing a connection ends it'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.my_connections();
  if n <> 0 then raise exception 'FAIL: Spec §10: removing ends the connection for both people'; end if;
  perform public.request_connection('(555) 010-2000');
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.incoming_connection_requests();
  if n <> 0 then raise exception 'FAIL: Spec §10: someone I blocked can''t send me requests'; end if;

  -- Declining isn't shown to the sender.
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  perform public.request_connection('alice@test.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select id into req from public.incoming_connection_requests() limit 1;
  perform public.answer_connection_request(req, 'decline');
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.sent_connection_requests();
  if n <> 1 then raise exception 'FAIL: Spec §10: a declined request still looks Sent to the sender'; end if;

  -- Delete my data: the Connections part clears my connections and requests.
  perform public.delete_my_data(array['connections']);
  select count(*) into n from public.sent_connection_requests();
  if n <> 0 then raise exception 'FAIL: Spec §8: Delete my data removes my connection requests when ticked'; end if;

  raise exception 'PASS: all connection checks passed (test data rolled back)';
end
$$;
