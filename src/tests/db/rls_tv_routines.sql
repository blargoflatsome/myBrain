-- Checks for routines on the TV (SPEC §9 Routines): what it reads and the one write it may make. Always rolls back.
-- Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  today constant date := '2026-11-26';
  morning uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  garage  uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  bobs    uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  brush   uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  meds    uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  sweep   uuid := 'bbbbbbbb-0000-4000-8000-000000000003';
  bob_step uuid := 'bbbbbbbb-0000-4000-8000-000000000004';
  pills   uuid := 'cccccccc-0000-4000-8000-000000000001';
  run_id  uuid := 'dddddddd-0000-4000-8000-000000000001';
  snap jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.paired_devices (user_id, key_hash) values (alice, public.connect_hash('alice-tv-key'));
  insert into public.habits (id, user_id, title, start_date) values (pills, alice, 'Take medication', '2026-11-01');
  insert into public.routines (id, user_id, title, weekdays, start_date) values
    (morning, alice, 'Morning', '{0,1,2,3,4,5,6}', '2026-11-01'),
    (garage,  alice, 'Clean the garage', null, '2026-11-01'),
    (bobs,    bob,   'Bob''s routine', '{0,1,2,3,4,5,6}', '2026-11-01');
  insert into public.routine_steps (id, user_id, routine_id, position, title, habit_id, start_date) values
    (brush, alice, morning, 0, 'Brush teeth', null, '2026-11-01'),
    (meds,  alice, morning, 1, 'Take medication', pills, '2026-11-01'),
    (sweep, alice, garage,  0, 'Sweep', null, '2026-11-01'),
    (bob_step, bob, bobs,   0, 'Bob''s step', null, '2026-11-01');
  -- The garage run started last week and isn't finished: run anytime carries over days.
  insert into public.routine_runs (id, user_id, routine_id, date, started_at) values (run_id, alice, garage, '2026-11-20', '2026-11-20T10:00Z');
  insert into public.routine_step_logs (user_id, run_id, step_id, status, logged_at) values (alice, run_id, sweep, 'skipped', '2026-11-20T10:01Z');

  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  snap := public.tv_snapshot('alice-tv-key', '2026-10-26', '2026-12-06', today);
  if jsonb_array_length(snap->'routine_steps') <> 3 or snap::text like '%Bob''s step%' then
    raise exception 'FAIL: Spec §9: the TV gets my routines'' steps, nobody else''s';
  end if;
  if not (snap->'routine_runs') @> jsonb_build_array(jsonb_build_object('id', run_id))
     or jsonb_array_length(snap->'routine_step_logs') <> 1 then
    raise exception 'FAIL: Spec §9: the TV gets a run-anytime routine''s open run from an earlier day, with its logs';
  end if;

  -- Completed on the habit step starts today's run, logs the step and completes the habit for today.
  perform public.tv_save_routine_step('alice-tv-key',
    jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000001', 'routine_id', morning, 'date', today, 'started_at', now(), 'finished_at', null)),
    jsonb_build_array(jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000001', 'run_id', 'eeeeeeee-0000-4000-8000-000000000001', 'step_id', meds, 'status', 'completed', 'logged_at', now())),
    jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000009', 'habit_id', pills, 'date', today, 'completed_at', now()));
  reset role;
  if not exists (select 1 from public.routine_step_logs where step_id = meds and status = 'completed' and user_id = alice)
     or not exists (select 1 from public.habit_logs where habit_id = pills and date = today and status = 'completed' and user_id = alice) then
    raise exception 'FAIL: Spec §9: Completed on the TV saves the step and completes its habit for the day';
  end if;
  execute 'set local role anon';

  -- Pressing again (the TV retrying) leaves the habit's one log for today alone.
  perform public.tv_save_routine_step('alice-tv-key', '[]',
    jsonb_build_array(jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000001', 'run_id', 'eeeeeeee-0000-4000-8000-000000000001', 'step_id', meds, 'status', 'completed', 'logged_at', now())),
    jsonb_build_object('id', 'ffffffff-0000-4000-8000-00000000000a', 'habit_id', pills, 'date', today, 'completed_at', now()));
  reset role;
  if (select count(*) from public.habit_logs where habit_id = pills and date = today and deleted_at is null) <> 1 then
    raise exception 'FAIL: Spec §9: a habit already logged that day is left alone';
  end if;
  execute 'set local role anon';

  begin
    perform public.tv_save_routine_step('alice-tv-key',
      jsonb_build_array(jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000002', 'routine_id', bobs, 'date', today, 'started_at', now())), '[]');
    raise exception 'FAIL: Spec §9: the TV can''t start someone else''s routine';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tv_save_routine_step('alice-tv-key', '[]',
      jsonb_build_array(jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000002', 'run_id', run_id, 'step_id', brush, 'status', 'completed', 'logged_at', now())));
    raise exception 'FAIL: Spec §9: a step log must be for a step of its run''s routine';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tv_save_routine_step('alice-tv-key', '[]',
      jsonb_build_array(jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000003', 'run_id', 'eeeeeeee-0000-4000-8000-000000000001', 'step_id', brush, 'status', 'completed', 'logged_at', now())),
      jsonb_build_object('id', 'ffffffff-0000-4000-8000-00000000000b', 'habit_id', pills, 'date', today, 'completed_at', now()));
    raise exception 'FAIL: Spec §9: the TV completes only the habit a completed step is linked to';
  exception when sqlstate '42501' then null;
  end;
  -- A TV a little behind can't turn a step completed on my phone into skipped.
  perform public.tv_save_routine_step('alice-tv-key', '[]',
    jsonb_build_array(jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000001', 'run_id', 'eeeeeeee-0000-4000-8000-000000000001', 'step_id', meds, 'status', 'skipped', 'logged_at', now())));
  reset role;
  if (select status from public.routine_step_logs where id = 'ffffffff-0000-4000-8000-000000000001') <> 'completed' then
    raise exception 'FAIL: Spec §9: a press on the TV never overwrites a step already saved';
  end if;
  update public.routine_steps set deleted_at = now() where id = brush;
  execute 'set local role anon';
  begin
    perform public.tv_save_routine_step('alice-tv-key', '[]',
      jsonb_build_array(jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000004', 'run_id', 'eeeeeeee-0000-4000-8000-000000000001', 'step_id', brush, 'status', 'completed', 'logged_at', now())));
    raise exception 'FAIL: Spec §9: a removed step isn''t logged';
  exception when sqlstate '42501' then null;
  end;
  reset role;
  update public.habit_logs set deleted_at = now() where habit_id = pills;
  execute 'set local role anon';
  begin
    perform public.tv_save_routine_step('alice-tv-key', '[]',
      jsonb_build_array(jsonb_build_object('id', 'ffffffff-0000-4000-8000-000000000001', 'run_id', 'eeeeeeee-0000-4000-8000-000000000001', 'step_id', meds, 'status', 'completed', 'logged_at', now())),
      jsonb_build_object('id', 'ffffffff-0000-4000-8000-00000000000c', 'habit_id', pills, 'date', today - 7, 'completed_at', now()));
    raise exception 'FAIL: Spec §9: a habit is completed only for a day its step''s run covers';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tv_save_routine_step('wrong-key', '[]', '[]');
    raise exception 'FAIL: Spec §9: a wrong key writes nothing';
  exception when sqlstate '28000' then null;
  end;

  raise exception 'PASS: all TV routine checks passed (test data rolled back)';
end
$$;
