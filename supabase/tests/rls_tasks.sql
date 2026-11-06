-- Database rule checks for task priority (SPEC §5 Tasks). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  p smallint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  insert into public.tasks (title) values ('no priority given') returning priority into p;
  if p <> 1 then raise exception 'FAIL: Spec §5 Tasks: new tasks default to Low priority (1)'; end if;

  begin
    insert into public.tasks (title, priority) values ('bad level', 4);
    raise exception 'FAIL: Spec §5 Tasks: priority is Low (1), Medium (2) or High (3) only';
  exception when check_violation then null;
  end;

  raise exception 'PASS: all task rule checks passed (test data rolled back)';
end
$$;
