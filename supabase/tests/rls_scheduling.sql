-- Checks for scheduling between connections (SPEC §10 Connections, part 5). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');
  insert into public.connections (user_id, friend_id) values (alice, bob), (bob, alice);
  insert into public.availability_rules (user_id, weekday, start_time, end_time) values (bob, 2, '18:00', '23:00'), (carol, 2, '18:00', '23:00');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.free_busy(array[bob]);
  if n <> 1 then raise exception 'FAIL: Spec §10: I see a connection''s free or busy times (got %)', n; end if;
  select count(*) into n from public.free_busy(array[carol]);
  if n <> 0 then raise exception 'FAIL: Spec §10: I can''t see free or busy times of someone I''m not connected with'; end if;

  execute 'reset role';
  update public.profiles set share_availability = false where user_id = bob;
  execute 'set local role authenticated';
  select count(*) into n from public.free_busy(array[bob]);
  if n <> 0 then raise exception 'FAIL: Spec §10: a connection who turned off sharing their availability shows nothing'; end if;

  raise exception 'PASS: all scheduling checks passed (test data rolled back)';
end
$$;
