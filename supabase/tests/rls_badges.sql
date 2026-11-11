-- Checks for badges and the Celebrations setting (SPEC §4, §5 Celebrations, §7, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.badges (id, user_id, kind, earned_at) values (gen_random_uuid(), bob, 'first_task', now());

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'badges';
  if n <> 1 then raise exception 'FAIL: Spec §7: badges sync live through Realtime'; end if;
  select count(*) into n from public.profiles where user_id = alice and celebrations = 'full';
  if n <> 1 then raise exception 'FAIL: Spec §5 Celebrations: the setting starts on Full'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.badges where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user can read only their own badges'; end if;
  delete from public.badges;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete badges (soft delete only)'; end if;

  insert into public.badges (id, kind, earned_at) values (gen_random_uuid(), 'first_task', now());
  begin
    insert into public.badges (id, kind, earned_at) values (gen_random_uuid(), 'first_task', now());
    raise exception 'FAIL: Spec §5 Celebrations: each badge is earned once';
  exception when unique_violation then null;
  end;
  begin
    insert into public.badges (id, user_id, kind, earned_at) values (gen_random_uuid(), bob, 'first_habit', now());
    raise exception 'FAIL: Spec §8: a user cannot give someone else a badge';
  exception when insufficient_privilege then null;
  end;

  update public.profiles set celebrations = 'gentle' where user_id = alice;
  begin
    update public.profiles set celebrations = 'loud' where user_id = alice;
    raise exception 'FAIL: Spec §5 Celebrations: the setting is Full, Gentle or Off';
  exception when check_violation then null;
  end;

  raise exception 'PASS: all badge checks passed (test data rolled back)';
end
$$;
