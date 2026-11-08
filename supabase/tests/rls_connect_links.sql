-- Checks for connect links and codes (SPEC §10 Connections, part 2). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  l record;
  l2 record;
  who text;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set display_name = 'Alice' where user_id = alice;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select * into l from public.create_connect_link();
  if length(l.code) <> 8 or length(l.token) < 32 then raise exception 'FAIL: Spec §10: a link has a long token and an 8-character code'; end if;
  begin
    perform 1 from public.connect_links;
    raise exception 'FAIL: Spec §10: clients cannot read connect links directly';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.my_connect_links();
  if n <> 1 then raise exception 'FAIL: Spec §10: my working links are listed'; end if;
  select count(*) into n from public.preview_connect_link(l.token, null);
  if n <> 0 then raise exception 'FAIL: Spec §10: my own link does nothing for me'; end if;

  -- Bob uses the link: connected straight away; the link is used up.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select display_name into who from public.preview_connect_link(l.token, null);
  if who is distinct from 'Alice' then raise exception 'FAIL: Spec §10: opening a link shows whose it is'; end if;
  who := public.use_connect_link(l.token, null);
  if who is distinct from 'Alice' then raise exception 'FAIL: Spec §10: using a link connects us'; end if;
  select count(*) into n from public.my_connections();
  if n <> 1 then raise exception 'FAIL: Spec §10: the link connects us straight away'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  if public.use_connect_link(l.token, null) is not null then raise exception 'FAIL: Spec §10: a link works for one person only'; end if;

  -- A code works (any case), cancelled links stop working, and code guessing is limited.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select * into l2 from public.create_connect_link();
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.preview_connect_link(null, lower(l2.code));
  if n <> 1 then raise exception 'FAIL: Spec §10: a code works in any case'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.cancel_connect_link(l2.id);
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  if public.use_connect_link(null, l2.code) is not null then raise exception 'FAIL: Spec §10: a cancelled link stops working'; end if;
  begin
    for i in 1..10 loop perform public.preview_connect_link(null, 'ZZZZZZZZ'); end loop;
    raise exception 'FAIL: Spec §10: code tries are limited to 10 an hour';
  exception when sqlstate '22023' then null;
  end;

  -- At most 5 working links at a time.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  for i in 1..5 loop perform public.create_connect_link(); end loop;
  begin
    perform public.create_connect_link();
    raise exception 'FAIL: Spec §10: at most 5 working links at a time';
  exception when sqlstate '22023' then null;
  end;

  raise exception 'PASS: all connect link checks passed (test data rolled back)';
end
$$;
