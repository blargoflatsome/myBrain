-- Database rule checks for habits and shared streaks (SPEC §5 Habits, Profile page, §8). Always rolls back.
-- Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  bob_habit uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{"full_name":"Alice"}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{"full_name":"Bob"}',   'authenticated', 'authenticated');

  insert into public.habits (user_id, title, current_streak, best_streak) values (bob, 'Bob runs', 3, 9) returning id into bob_habit;
  insert into public.habits (user_id, title, is_private) values (bob, 'Bob meds', true);
  insert into public.habit_logs (user_id, habit_id, date, status, completed_at) values (bob, bob_habit, current_date, 'completed', now());

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('habits', 'habit_logs');
  if n <> 2 then raise exception 'FAIL: Spec §7: habits and habit logs sync live through Realtime'; end if;

  -- Act as Alice.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.habits where user_id = bob;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot read someone else''s habits'; end if;
  select count(*) into n from public.habit_logs where user_id = bob;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot read someone else''s habit logs'; end if;

  select count(*) into n from public.shared_streaks() where user_id = bob;
  if n <> 0 then raise exception 'FAIL: Spec §5 Profile page: streaks are private by default'; end if;

  begin
    insert into public.habit_logs (habit_id, date, status, completed_at) values (bob_habit, current_date + 1, 'completed', now());
    raise exception 'FAIL: Spec §8: a user cannot log someone else''s habit';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.habits (title, timer_minutes) values ('timer without notify time', 30);
    raise exception 'FAIL: Spec §5 Habits: a timer needs a notify time';
  exception when check_violation then null;
  end;

  begin
    insert into public.habits (title, weekdays) values ('bad weekday', '{7}');
    raise exception 'FAIL: Spec §5 Habits: weekdays are 0 (Sunday) to 6 (Saturday)';
  exception when check_violation then null;
  end;

  insert into public.habits (title) values ('Alice stretches') ;
  select count(*) into n from public.habits where user_id = alice and weekdays = '{0,1,2,3,4,5,6}' and is_private = false;
  if n <> 1 then raise exception 'FAIL: Spec §5 Habits: new habits repeat every day and are not private by default'; end if;

  insert into public.habit_logs (habit_id, date, status, completed_at)
    select id, current_date, 'completed', now() from public.habits where user_id = alice;
  begin
    insert into public.habit_logs (habit_id, date, status)
      select id, current_date, 'missed' from public.habits where user_id = alice;
    raise exception 'FAIL: Spec §4: one log per habit per day';
  exception when unique_violation then null;
  end;

  -- Bob shares with everyone: Alice sees his public habit's title and streaks, never his private one.
  execute 'reset role';
  update public.profiles set streak_visibility = 'everyone' where user_id = bob;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.shared_streaks() where user_id = bob and title = 'Bob runs' and best_streak = 9;
  if n <> 1 then raise exception 'FAIL: Spec §5 Profile page: shared streaks show habit title and streak numbers'; end if;
  select count(*) into n from public.shared_streaks() where user_id = bob and title = 'Bob meds';
  if n <> 0 then raise exception 'FAIL: Spec §5 Habits: a private habit never appears to other users'; end if;

  -- "People I approve" shares nothing until Phase 2 approvals exist.
  execute 'reset role';
  update public.profiles set streak_visibility = 'approved' where user_id = bob;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.shared_streaks() where user_id = bob;
  if n <> 0 then raise exception 'FAIL: Spec §5 Profile page: approved-only streaks are not visible without approval'; end if;

  execute 'reset role';
  begin
    execute 'set local role anon';
    perform 1 from public.shared_streaks();
    raise exception 'FAIL: Spec §8: signed-out visitors cannot read shared streaks';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all habit rule checks passed (test data rolled back)';
end
$$;
