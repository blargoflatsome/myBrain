-- Checks for TV pairing (SPEC §9 Signing in by pairing). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  p record;
  p2 record;
  poll record;
  dev uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');

  -- The TV isn't signed in.
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select * into p from public.tv_pair_start();
  if p.code !~ '^[A-HJ-NP-Z2-9]{6}$' or length(p.secret) <> 64 then
    raise exception 'FAIL: Spec §9: a TV code is 6 characters without look-alikes, with a long secret';
  end if;
  if p.expires_at > now() + interval '10 minutes' then raise exception 'FAIL: Spec §9: a code is good for 10 minutes'; end if;
  begin
    perform 1 from public.tv_pairings;
    raise exception 'FAIL: Spec §9: nobody reads pairings directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.paired_devices;
    raise exception 'FAIL: Spec §9: nobody reads paired devices directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pair_tv(p.code);
    raise exception 'FAIL: Spec §9: only a signed-in person approves a code';
  exception when insufficient_privilege then null;
  end;
  select * into poll from public.tv_pair_poll(p.secret);
  if poll.status <> 'waiting' or poll.device_key is not null then raise exception 'FAIL: Spec §9: a code waits until approved'; end if;
  select * into poll from public.tv_pair_poll('not-the-secret');
  if poll.status <> 'expired' then raise exception 'FAIL: Spec §9: an unknown secret pairs nothing'; end if;

  -- Alice approves it (any case, spaces ignored); the TV gets a key once.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  if not public.pair_tv(lower(substr(p.code, 1, 3)) || ' ' || substr(p.code, 4)) then
    raise exception 'FAIL: Spec §9: approving the code shown on the TV pairs it';
  end if;
  if public.pair_tv(p.code) then raise exception 'FAIL: Spec §9: a code pairs one TV once'; end if;
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select * into poll from public.tv_pair_poll(p.secret);
  if poll.status <> 'paired' or length(poll.device_key) <> 64 then raise exception 'FAIL: Spec §9: the TV gets its device key'; end if;
  select * into p2 from public.tv_pair_poll(p.secret);
  if p2.status <> 'expired' or p2.device_key is not null then raise exception 'FAIL: Spec §9: the key is handed over only once'; end if;
  if not public.tv_check(poll.device_key) then raise exception 'FAIL: Spec §9: the device key works'; end if;
  begin
    perform public.tv_check('wrong');
    raise exception 'FAIL: Spec §9: a wrong key works';
  exception when sqlstate '28000' then null;
  end;
  begin
    perform public.tv_owner(poll.device_key);
    raise exception 'FAIL: Spec §9: the TV only calls the tv_* functions';
  exception when insufficient_privilege then null;
  end;

  -- Paired devices: mine only; Unpair stops the key and Undo brings it back.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.my_paired_devices();
  if n <> 0 then raise exception 'FAIL: Spec §9: Paired devices lists only my own'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select id into dev from public.my_paired_devices();
  if dev is null then raise exception 'FAIL: Spec §9: Paired devices lists my TV'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.unpair_device(dev);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  if not public.tv_check(poll.device_key) then raise exception 'FAIL: Spec §9: someone else cannot unpair my TV'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.unpair_device(dev);
  select count(*) into n from public.my_paired_devices();
  if n <> 0 then raise exception 'FAIL: Spec §9: an unpaired TV leaves the list'; end if;
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  begin
    perform public.tv_check(poll.device_key);
    raise exception 'FAIL: Spec §9: Unpair makes the key stop working';
  exception when sqlstate '28000' then null;
  end;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.unpair_device(dev, true);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  if not public.tv_check(poll.device_key) then raise exception 'FAIL: Spec §9: Undo brings the same key back'; end if;

  -- Code tries are limited to 10 a day per account (the two above count, so the 11th is refused).
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  begin
    for i in 1..9 loop perform public.pair_tv('ZZZZZZ'); end loop;
    raise exception 'FAIL: Spec §9: code tries are limited to 10 a day';
  exception when sqlstate 'P0429' then null;
  end;

  raise exception 'PASS: all TV pairing checks passed (test data rolled back)';
end
$$;
