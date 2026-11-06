-- Database rule checks for quests (SPEC §5 Random Quest). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  insert into public.quests (title, energy_level, time_bucket) values ('ok', 'medicated', 'half_day');
  insert into public.quests (title) values ('untagged is fine');
  insert into public.quests (title, energy_level) values ('needs setup is allowed', 'needs_setup');

  begin
    insert into public.quests (title, energy_level) values ('bad energy', 'high');
    raise exception 'FAIL: Spec §5 Random Quest: energy is Meh, Ugh, Needs setup or Medicated only';
  exception when check_violation then null;
  end;

  begin
    insert into public.quests (title, time_bucket) values ('bad time', '10m');
    raise exception 'FAIL: Spec §5 Random Quest: time is 30 min, 2 hours, half a day or a full day only';
  exception when check_violation then null;
  end;

  raise exception 'PASS: all quest rule checks passed (test data rolled back)';
end
$$;
