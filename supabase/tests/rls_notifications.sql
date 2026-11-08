-- Checks for today's notifications (SPEC §5 Dashboard, §6). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  item  constant uuid := '33333333-3333-3333-3333-333333333333';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id in (alice, bob);

  -- A reminder sent twice the same day (a priority nag) is one entry, with the latest time.
  perform public.record_notification(alice, 'habit', item, 'Take meds', 'Past you asked…', '/habits', '2026-11-10 13:00:00+00');
  perform public.record_notification(alice, 'habit', item, 'Take meds', 'Past you asked…', '/habits', '2026-11-10 13:10:00+00');
  select count(*) into n from public.notifications where user_id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §6: the same reminder on the same day is one notification'; end if;
  select count(*) into n from public.notifications where user_id = alice and sent_at = '2026-11-10 13:10:00+00' and local_date = '2026-11-10';
  if n <> 1 then raise exception 'FAIL: Spec §6: a notification keeps the latest time and my local date'; end if;
  -- An outside address is never stored as a link.
  perform public.record_notification(bob, 'event_message', gen_random_uuid(), 'Hi', 'x', 'https://evil.example', '2026-11-10 13:00:00+00');
  select count(*) into n from public.notifications where user_id = bob and url = '/';
  if n <> 1 then raise exception 'FAIL: Spec §8: a notification only links inside the app'; end if;

  -- Each person sees only their own; people can't record notifications through the server function.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.notifications where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: I can read only my own notifications'; end if;
  begin
    perform public.record_notification(bob, 'habit', item, 'x', 'x', '/', now());
    raise exception 'FAIL: Spec §8: only the server records notifications for others';
  exception when insufficient_privilege then null;
  end;
  -- Clearing one is a soft delete, so it syncs to my other devices.
  update public.notifications set deleted_at = now() where user_id = alice;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: Spec §5: I can clear my notifications'; end if;
  execute 'reset role';

  -- At midnight in my time zone, the day's notifications are cleared.
  update public.notifications set deleted_at = null, local_date = current_date - 2 where user_id = alice;
  perform public.expire_notifications();
  select count(*) into n from public.notifications where user_id = alice and deleted_at is null;
  if n <> 0 then raise exception 'FAIL: Spec §5: yesterday''s notifications are cleared at midnight'; end if;
  select count(*) into n from cron.job where jobname = 'my-brain-expire-notifications';
  if n <> 1 then raise exception 'FAIL: Spec §5: the midnight clear-out runs every hour'; end if;

  raise exception 'PASS: all notification checks passed (test data rolled back)';
end
$$;
