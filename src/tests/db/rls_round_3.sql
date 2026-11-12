-- Checks for feedback round 3 (SPEC §5 Habits, Tags). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  recycling uuid;
  trash uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id = alice;

  -- Two Thursday habits every 2 weeks, starting a week apart, alternate (2026-11-12 and 2026-11-19 are Thursdays).
  if not public.habit_on('2026-11-12', '{4}', 2::smallint, false, '2026-11-26') then raise exception 'FAIL: Spec §5: Recycling is on every other Thursday from its start'; end if;
  if public.habit_on('2026-11-12', '{4}', 2::smallint, false, '2026-11-19') then raise exception 'FAIL: Spec §5: Recycling is off the Thursday after it starts'; end if;
  if not public.habit_on('2026-11-19', '{4}', 2::smallint, false, '2026-12-03') then raise exception 'FAIL: Spec §5: Trash is on the opposite Thursdays'; end if;
  if public.habit_on('2026-11-19', '{4}', 2::smallint, false, '2026-11-12') then raise exception 'FAIL: Spec §5: a habit is never on before its start date'; end if;
  -- Every month on the start date's day; a 31st falls on a short month's last day.
  if not public.habit_on('2026-11-12', '{0,1,2,3,4,5,6}', 1::smallint, true, '2026-12-12') then raise exception 'FAIL: Spec §5: monthly repeats on the same day of the month'; end if;
  if public.habit_on('2026-11-12', '{0,1,2,3,4,5,6}', 1::smallint, true, '2026-12-13') then raise exception 'FAIL: Spec §5: monthly is only that day'; end if;
  if not public.habit_on('2026-01-31', '{0,1,2,3,4,5,6}', 1::smallint, true, '2026-02-28') then raise exception 'FAIL: Spec §5: a 31st falls on the last day of a shorter month'; end if;

  -- Reminders follow the same rule: Recycling at 3 pm on its Thursdays only.
  insert into public.habits (user_id, title, notify_time, start_date, weekdays, week_interval) values (alice, 'Recycling', '15:00', '2026-11-12', '{4}', 2) returning id into recycling;
  insert into public.habits (user_id, title, notify_time, start_date, weekdays, week_interval) values (alice, 'Trash', '15:00', '2026-11-19', '{4}', 2) returning id into trash;
  select count(*) into n from public.due_reminders('2026-11-12 15:01:00-05') where item_id in (recycling, trash);
  if n <> 1 then raise exception 'FAIL: Spec §5: only Recycling is reminded on Nov 12'; end if;
  select count(*) into n from public.due_reminders('2026-11-19 15:01:00-05') where item_id = trash;
  if n <> 1 then raise exception 'FAIL: Spec §5: Trash is reminded on Nov 19'; end if;

  -- Tags are only for tasks, habits and routines.
  insert into public.tags (user_id, name) values (alice, 'chores');
  insert into public.item_tags (user_id, tag_id, item_type, item_id) select alice, id, 'habit', recycling from public.tags where user_id = alice;
  begin
    insert into public.item_tags (user_id, tag_id, item_type, item_id) select alice, id, 'event', gen_random_uuid() from public.tags where user_id = alice;
    raise exception 'FAIL: Spec §5: events cannot be tagged';
  exception when check_violation then null;
  end;

  raise exception 'PASS: all round 3 checks passed (test data rolled back)';
end
$$;
