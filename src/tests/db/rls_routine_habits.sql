-- Checks for habit steps and run-anytime routines (SPEC §5 Routines, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  garage uuid;
  morning uuid;
  meds uuid;
  bob_habit uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob, 'bob@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id in (alice, bob);

  -- A run-anytime routine has no weekdays and no reminder, and is never reminded.
  insert into public.routines (user_id, title, weekdays) values (alice, 'Clean the garage', null) returning id into garage;
  begin
    insert into public.routines (user_id, title, weekdays, notify_time) values (alice, 'Bad', null, '08:00');
    raise exception 'FAIL: Spec §5 Routines: a run-anytime routine has no reminder';
  exception when check_violation then null;
  end;
  select count(*) into n from public.due_reminders('2026-11-10 23:59:00-05') where item_id = garage;
  if n <> 0 then raise exception 'FAIL: Spec §5 Routines: a run-anytime routine is never reminded'; end if;

  -- It can be finished and started again the same day.
  insert into public.routine_runs (user_id, routine_id, date, started_at, finished_at) values (alice, garage, '2026-11-10', now(), now());
  insert into public.routine_runs (user_id, routine_id, date, started_at) values (alice, garage, '2026-11-10', now());
  select count(*) into n from public.routine_runs where routine_id = garage;
  if n <> 2 then raise exception 'FAIL: Spec §5 Routines: a run-anytime routine can be started again after finishing'; end if;

  -- A step can be one of my habits, but never someone else's.
  insert into public.habits (user_id, title) values (alice, 'Take medication') returning id into meds;
  insert into public.habits (user_id, title) values (bob, 'Bob habit') returning id into bob_habit;
  insert into public.routines (user_id, title) values (alice, 'Morning') returning id into morning;
  insert into public.routine_steps (user_id, routine_id, position, title, habit_id) values (alice, morning, 0, 'Take medication', meds);
  select count(*) into n from public.routine_steps where routine_id = morning and habit_id = meds;
  if n <> 1 then raise exception 'FAIL: Spec §5 Routines: a habit can be a routine step'; end if;
  begin
    insert into public.routine_steps (user_id, routine_id, position, title, habit_id) values (alice, morning, 1, 'Sneaky', bob_habit);
    raise exception 'FAIL: Spec §8: a routine step cannot link to someone else''s habit';
  exception when foreign_key_violation then null;
  end;

  raise exception 'PASS: all habit-step and run-anytime checks passed (test data rolled back)';
end
$$;
