-- Checks for Pause all streaks and Appearance (SPEC §5 Habits, §3 Visual style, §7, §8). Always rolls back.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  h uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id in (alice, bob);
  insert into public.habit_pauses (user_id, start_date) values (bob, '2026-11-01');

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'habit_pauses';
  if n <> 1 then raise exception 'FAIL: Spec §7: pauses sync live through Realtime'; end if;

  -- No habit reminder on a paused day; one again once the pause has ended.
  insert into public.habits (user_id, title, notify_time, start_date) values (alice, 'Stretch', '08:00', '2026-11-02') returning id into h;
  insert into public.habit_pauses (user_id, start_date, end_date) values (alice, '2026-11-09', '2026-11-10');
  select count(*) into n from public.due_reminders('2026-11-10 08:01:00-05') where item_id = h;
  if n <> 0 then raise exception 'FAIL: Spec §5: no habit reminders on a paused day'; end if;
  select count(*) into n from public.due_reminders('2026-11-11 08:01:00-05') where item_id = h;
  if n <> 1 then raise exception 'FAIL: Spec §5: reminders come back after the pause ends'; end if;

  begin
    insert into public.habit_pauses (user_id, start_date, end_date) values (alice, '2026-11-10', '2026-11-09');
    raise exception 'FAIL: Spec §4: a pause cannot end before it starts';
  exception when check_violation then null;
  end;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.habit_pauses where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user can read only their own pauses'; end if;
  begin
    insert into public.habit_pauses (user_id, start_date) values (bob, '2026-11-12');
    raise exception 'FAIL: Spec §8: a user cannot pause someone else''s streaks';
  exception when insufficient_privilege then null;
  end;
  delete from public.habit_pauses;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete pauses (soft delete only)'; end if;

  -- Appearance is one of three choices, and mine to change.
  update public.profiles set appearance = 'dark' where user_id = alice;
  begin
    update public.profiles set appearance = 'purple' where user_id = alice;
    raise exception 'FAIL: Spec §3: Appearance is System, Light or Dark';
  exception when check_violation then null;
  end;

  -- Delete my data (Habits) removes my pauses, never anyone else's.
  perform public.delete_my_data(array['habits']);
  execute 'reset role';
  select count(*) into n from public.habit_pauses where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5: Delete my data removes my pauses with my habits'; end if;
  select count(*) into n from public.habit_pauses where user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §8: Delete my data never touches other people''s pauses'; end if;
  select count(*) into n from public.profiles where user_id = alice and appearance = 'dark';
  if n <> 1 then raise exception 'FAIL: Spec §5: Delete my data leaves my settings alone'; end if;

  raise exception 'PASS: all pause and appearance checks passed (test data rolled back)';
end
$$;
