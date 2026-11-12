-- Checks for connection pushes (SPEC §5 Connections, §6). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  req   constant uuid := '33333333-3333-3333-3333-333333333333';
  t     constant timestamptz := now();
  local_now time;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  local_now := (t at time zone 'America/New_York')::time;
  -- Alice is in quiet hours right now (an hour either side, so it also works across midnight).
  update public.profiles set timezone = 'America/New_York', quiet_hours_start = local_now - interval '1 hour',
    quiet_hours_end = local_now + interval '1 hour' where user_id = alice;
  update public.profiles set timezone = 'America/New_York' where user_id = bob;

  -- A connection request to Bob is pushed on the next run, once.
  perform public.record_notification(bob, 'connection_request', req, 'Alice wants to connect', 'Open Connections to answer.', '/connections', t);
  if public.send_connection_pushes(t) <> 1 then raise exception 'FAIL: Spec §5 Connections: a connection request is pushed'; end if;
  if public.send_connection_pushes(t) <> 0 then raise exception 'FAIL: Spec §5 Connections: a connection request is pushed only once'; end if;

  -- The app uploading an older copy of the alert (marking it seen) never makes it push again.
  update public.notifications set pushed_at = null, read_at = t where user_id = bob;
  select count(*) into n from public.notifications where user_id = bob and pushed_at is not null;
  if n <> 1 then raise exception 'FAIL: Spec §6: a pushed alert stays pushed'; end if;

  -- An acceptance to Alice waits through her quiet hours, then goes out.
  perform public.record_notification(alice, 'connection_accepted', req, 'Bob accepted your connection request', 'x', '/connections', t);
  if public.send_connection_pushes(t) <> 0 then raise exception 'FAIL: Spec §6: connection pushes wait during quiet hours'; end if;
  if public.send_connection_pushes(t + interval '3 hours') <> 1 then raise exception 'FAIL: Spec §6: a held connection push goes out when quiet hours end'; end if;

  -- One already seen in the app isn't pushed; nor is anything that isn't a connection alert.
  perform public.record_notification(bob, 'connection_accepted', gen_random_uuid(), 'Carol connected with you', 'x', '/connections', t);
  update public.notifications set read_at = t where user_id = bob and pushed_at is null;
  perform public.record_notification(bob, 'event_message', gen_random_uuid(), 'Hi', 'x', '/calendar', t);
  if public.send_connection_pushes(t) <> 0 then raise exception 'FAIL: Spec §6: an alert already seen, or not about connections, is not pushed here'; end if;

  select count(*) into n from cron.job where jobname = 'my-brain-connection-pushes' and schedule = '* * * * *';
  if n <> 1 then raise exception 'FAIL: Spec §6: connection pushes are checked every minute'; end if;

  -- Only the server sends them.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  begin
    perform public.send_connection_pushes(t);
    raise exception 'FAIL: Spec §8: only the server sends connection pushes';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  raise exception 'PASS: all connection push checks passed (test data rolled back)';
end
$$;
