-- Database rule checks for habits (SPEC §5 Habits, §8, §10). Always rolls back.
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

  -- Nobody sees another user's streaks unless both agreed to connect: no "Everyone" choice, no shared list.
  select count(*) into n from pg_proc where proname = 'shared_streaks' and pronamespace = 'public'::regnamespace;
  if n <> 0 then raise exception 'FAIL: Spec §10: there is no list of streaks shared with every user'; end if;
  begin
    update public.profiles set streak_visibility = 'everyone' where user_id = alice;
    raise exception 'FAIL: Spec §5 Account page: "Everyone" is not a visibility choice';
  exception when check_violation then null;
  end;

  raise exception 'PASS: all habit rule checks passed (test data rolled back)';
end
$$;
