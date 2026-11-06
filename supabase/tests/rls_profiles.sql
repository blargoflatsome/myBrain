-- Database rule checks for profiles (SPEC §2, §4, §7, §8).
-- Runs as one statement and always rolls back, so it leaves no data behind. No Docker needed.
-- Run against dev:  npm run test:db
-- Result: an error line saying "PASS: ..." means every check passed; "FAIL: <rule>" names the broken rule.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  n int;
  ok boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{"full_name":"Alice"}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{"full_name":"Bob"}',   'authenticated', 'authenticated');

  select count(*) into n from public.profiles where user_id in (alice, bob);
  if n <> 2 then raise exception 'FAIL: Spec §4: a profile is created automatically for each new user'; end if;

  -- Act as Alice, the way a signed-in browser does.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.profiles where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §2/§8: a user can read only their own profile'; end if;
  select count(*) into n from public.profiles where user_id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §8: a user can read their own profile'; end if;

  update public.profiles set bio = 'changed by alice' where user_id = bob;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot change someone else''s profile'; end if;

  begin
    insert into public.profiles (user_id) values (bob);
    raise exception 'FAIL: Spec §8: a user cannot create a profile for someone else';
  exception when insufficient_privilege then null;
  end;

  delete from public.profiles;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete rows (soft delete only)'; end if;

  update public.profiles set updated_at = '2000-01-01', created_at = '2000-01-01'
    where user_id = alice
    returning updated_at = now() and created_at <> '2000-01-01' into ok;
  if not coalesce(ok, false) then raise exception 'FAIL: Spec §4: created_at and updated_at are set by the server, not the device'; end if;

  execute 'reset role';
  select count(*) into n from public.profiles where user_id = bob and bio is null;
  if n <> 1 then raise exception 'FAIL: Spec §8: the other user''s profile is unchanged'; end if;

  -- Always roll back the test data.
  raise exception 'PASS: all 8 profile rule checks passed (test data rolled back)';
end
$$;
