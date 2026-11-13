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

  -- Bob's events: a timed one (busy), an all-day one (free unless shown as busy), one shown as free, and Alice's
  -- event he said Maybe to (tentative).
  insert into public.events (id, user_id, title, start_date, start_time, end_date, end_time, repeat) values
    ('aaaaaaaa-0000-4000-8000-000000000001', bob, 'Dinner', '2026-12-01', '19:00', '2026-12-01', '21:00', 'never'),
    ('aaaaaaaa-0000-4000-8000-000000000002', bob, 'Trip', '2026-12-02', null, '2026-12-02', null, 'never'),
    ('aaaaaaaa-0000-4000-8000-000000000003', bob, 'Lunch reminder', '2026-12-03', '12:00', '2026-12-03', '13:00', 'never');
  update public.events set show_as = 'free' where id = 'aaaaaaaa-0000-4000-8000-000000000003';
  insert into public.events (id, user_id, title, start_date, start_time, end_date, end_time, repeat) values
    ('aaaaaaaa-0000-4000-8000-000000000004', alice, 'Party', '2026-12-04', '20:00', '2026-12-04', '23:00', 'never');
  insert into public.event_invites (id, user_id, event_id, name, response) values
    ('bbbbbbbb-0000-4000-8000-000000000001', alice, 'aaaaaaaa-0000-4000-8000-000000000004', 'Bob', 'maybe');
  insert into public.invite_recipients (invite_id, user_id) values ('bbbbbbbb-0000-4000-8000-000000000001', bob);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.free_busy(array[bob]) where kind = 'shares';
  if n <> 1 then raise exception 'FAIL: Spec §10 Scheduler: a connection who shares their times says so (got %)', n; end if;
  select count(*) into n from public.free_busy(array[bob]) where kind = 'rule' and level = 'busy';
  if n <> 1 then raise exception 'FAIL: Spec §10: I see a connection''s free or busy times (got %)', n; end if;
  select count(*) into n from public.free_busy(array[bob]) where kind = 'event' and start_date = '2026-12-01' and level = 'busy';
  if n <> 1 then raise exception 'FAIL: Spec §10 Scheduler: a timed event is busy'; end if;
  select count(*) into n from public.free_busy(array[bob]) where kind = 'event' and start_date in ('2026-12-02', '2026-12-03');
  if n <> 0 then raise exception 'FAIL: Spec §10 Scheduler: an all-day event, and one shown as Free, are free'; end if;
  select count(*) into n from public.free_busy(array[bob]) where kind = 'event' and start_date = '2026-12-04' and level = 'tentative';
  if n <> 1 then raise exception 'FAIL: Spec §10 Scheduler: an event I said Maybe to is tentative'; end if;

  select count(*) into n from public.free_busy(array[carol]);
  if n <> 0 then raise exception 'FAIL: Spec §10: I can''t see free or busy times of someone I''m not connected with'; end if;

  execute 'reset role';
  update public.events set show_as = 'busy' where id = 'aaaaaaaa-0000-4000-8000-000000000002';
  execute 'set local role authenticated';
  select count(*) into n from public.free_busy(array[bob]) where kind = 'event' and start_date = '2026-12-02';
  if n <> 1 then raise exception 'FAIL: Spec §10 Scheduler: an all-day event shown as Busy is busy'; end if;

  -- The host marks someone optional; nobody else can.
  perform public.set_invite_optional('bbbbbbbb-0000-4000-8000-000000000001', true);
  select count(*) into n from public.event_people('aaaaaaaa-0000-4000-8000-000000000004') where optional and user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §10 Scheduler: the host sees which connection is invited and that they''re optional'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  begin
    perform public.set_invite_optional('bbbbbbbb-0000-4000-8000-000000000001', false);
    raise exception 'FAIL: Spec §10 Scheduler: only the host marks someone optional';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.event_people('aaaaaaaa-0000-4000-8000-000000000004') where user_id is not null;
  if n <> 0 then raise exception 'FAIL: Spec §8: an invitee doesn''t see which accounts the others are'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  execute 'reset role';
  update public.profiles set share_availability = false where user_id in (alice, bob);
  execute 'set local role authenticated';
  select count(*) into n from public.free_busy(array[bob]);
  if n <> 0 then raise exception 'FAIL: Spec §10: a connection who turned off sharing their availability shows nothing (unknown)'; end if;
  select count(*) into n from public.free_busy(array[alice]) where kind = 'shares';
  if n <> 1 then raise exception 'FAIL: Spec §10 Scheduler: my own times are always checked, even when I don''t share them'; end if;

  raise exception 'PASS: all scheduling checks passed (test data rolled back)';
end
$$;
