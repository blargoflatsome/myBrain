-- Checks for My people (SPEC §4, §5 Calendar, §7, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.people (user_id, name, phone) values (bob, 'Bob''s friend', '555 010 1000');

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'people';
  if n <> 1 then raise exception 'FAIL: Spec §7: my people sync live through Realtime'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.people where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user can read only their own people'; end if;
  update public.people set name = 'changed' where user_id = bob;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot change someone else''s people'; end if;
  delete from public.people;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete people (soft delete only)'; end if;

  insert into public.people (name, email) values ('Allie Hannah', 'allie@example.com');
  select count(*) into n from public.people where user_id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §5: a saved person belongs to whoever saved them'; end if;
  begin
    insert into public.people (name) values ('No way to reach');
    raise exception 'FAIL: Spec §4: a saved person has an email or a phone number';
  exception when check_violation then null;
  end;
  begin
    insert into public.people (name, phone) values (repeat('x', 121), '5550102000');
    raise exception 'FAIL: Spec §8: a saved person''s name is at most 120 characters';
  exception when check_violation then null;
  end;
  begin
    insert into public.people (user_id, phone) values (bob, '5550103000');
    raise exception 'FAIL: Spec §8: a user cannot save people for someone else';
  exception when insufficient_privilege then null;
  end;

  -- Delete my data: the My people part removes only my people.
  perform public.delete_my_data(array['people']);
  execute 'reset role';
  select count(*) into n from public.people where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: Delete my data removes my people when ticked'; end if;
  select count(*) into n from public.people where user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §8: Delete my data never touches other people''s saved people'; end if;

  raise exception 'PASS: all My people checks passed (test data rolled back)';
end
$$;
