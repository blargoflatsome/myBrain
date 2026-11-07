-- Database rule checks for routines (SPEC §5 Routines, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  bob_routine uuid;
  bob_step uuid;
  bob_run uuid;
  my_routine uuid;
  my_step uuid;
  my_run uuid;
  t text;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');

  insert into public.routines (user_id, title) values (bob, 'Bob mornings') returning id into bob_routine;
  insert into public.routine_steps (user_id, routine_id, title) values (bob, bob_routine, 'Brush teeth') returning id into bob_step;
  insert into public.routine_runs (user_id, routine_id, date, started_at) values (bob, bob_routine, current_date, now()) returning id into bob_run;
  insert into public.routine_step_logs (user_id, run_id, step_id, status, logged_at) values (bob, bob_run, bob_step, 'completed', now());

  select count(*) into n from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename in ('routines', 'routine_steps', 'routine_runs', 'routine_step_logs');
  if n <> 4 then raise exception 'FAIL: Spec §7: routine tables sync live through Realtime'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  foreach t in array array['routines', 'routine_steps', 'routine_runs', 'routine_step_logs'] loop
    execute format('select count(*) from public.%I where user_id <> %L', t, alice) into n;
    if n <> 0 then raise exception 'FAIL: Spec §8: a user can read only their own % rows', t; end if;
    execute format('delete from public.%I', t);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete % rows', t; end if;
  end loop;

  begin
    insert into public.routine_steps (routine_id, title) values (bob_routine, 'sneaky step');
    raise exception 'FAIL: Spec §8: a user cannot add steps to someone else''s routine';
  exception when foreign_key_violation then null;
  end;

  insert into public.routines (title) values ('My mornings') returning id into my_routine;
  select count(*) into n from public.routines where id = my_routine and weekdays = '{0,1,2,3,4,5,6}';
  if n <> 1 then raise exception 'FAIL: Spec §5 Routines: new routines run every day by default'; end if;

  insert into public.routine_steps (routine_id, title) values (my_routine, 'Shower') returning id into my_step;
  insert into public.routine_runs (routine_id, date, started_at) values (my_routine, current_date, now()) returning id into my_run;

  begin
    insert into public.routine_step_logs (run_id, step_id, status, logged_at) values (my_run, bob_step, 'completed', now());
    raise exception 'FAIL: Spec §8: a user cannot log someone else''s step';
  exception when foreign_key_violation then null;
  end;

  -- One run per scheduled routine per day comes from its fixed run id (the same id for a routine and day on every
  -- device, SPEC §7), tested in src/routines/rules.test.ts; run-anytime routines may start again the same day.

  insert into public.routine_step_logs (run_id, step_id, status, logged_at) values (my_run, my_step, 'skipped', now());
  begin
    insert into public.routine_step_logs (run_id, step_id, status, logged_at) values (my_run, my_step, 'completed', now());
    raise exception 'FAIL: Spec §4: one log per step per run';
  exception when unique_violation then null;
  end;

  raise exception 'PASS: all routine rule checks passed (test data rolled back)';
end
$$;
