-- Checks for trophies: levels on badges, the activity log and the server-side counts (SPEC §4, §5 Trophies, §7, §8).
-- Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  n int;
  c int;
  b int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');
  insert into public.activity_log (id, user_id, kind, at) values (gen_random_uuid(), bob, 'focus', now());
  -- Alice connected with Bob (still) and Carol (removed since: it still counts) and blocked Carol.
  insert into public.connections (user_id, friend_id) values (alice, bob);
  insert into public.connections (user_id, friend_id, deleted_at) values (carol, alice, now());
  insert into public.connection_blocks (user_id, blocked_user) values (alice, carol);

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'activity_log';
  if n <> 1 then raise exception 'FAIL: Spec §7: the activity log syncs live through Realtime'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  -- Levels on a trophy row
  insert into public.badges (id, kind, earned_at, levels) values (gen_random_uuid(), 'habit_streak', now(), '["2026-11-01T00:00:00Z", "2026-11-05T00:00:00Z"]');
  begin
    insert into public.badges (id, kind, earned_at, levels) values (gen_random_uuid(), 'tasks_created', now(), '{"not": "a list"}');
    raise exception 'FAIL: Spec §5 Trophies: levels are a list';
  exception when check_violation then null;
  end;
  begin
    insert into public.badges (id, kind, earned_at, levels) values (gen_random_uuid(), 'tasks_done', now(), '[1, 2, 3, 4, 5, 6, 7]');
    raise exception 'FAIL: Spec §5 Trophies: at most six levels (Bronze to Legendary)';
  exception when check_violation then null;
  end;

  -- The activity log: my own rows only, soft delete only, known kinds only
  select count(*) into n from public.activity_log where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user can read only their own activity'; end if;
  insert into public.activity_log (id, kind, at, detail) values (gen_random_uuid(), 'capture', now(), '{"type": "task"}');
  delete from public.activity_log;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete activity (soft delete only)'; end if;
  begin
    insert into public.activity_log (id, kind, at) values (gen_random_uuid(), 'something_else', now());
    raise exception 'FAIL: Spec §5 Trophies: the activity log keeps Focus sessions, captures and emptying Orphans only';
  exception when check_violation then null;
  end;
  begin
    insert into public.activity_log (id, user_id, kind, at) values (gen_random_uuid(), bob, 'focus', now());
    raise exception 'FAIL: Spec §8: a user cannot write someone else''s activity';
  exception when insufficient_privilege then null;
  end;

  -- Counts from the server
  select connections, blocks into c, b from public.trophy_counts();
  if c <> 2 then raise exception 'FAIL: Spec §5 Trophies: connections ever made count removed ones too (got %)', c; end if;
  if b <> 1 then raise exception 'FAIL: Spec §5 Trophies: people I blocked are counted (got %)', b; end if;

  raise exception 'PASS: all trophy checks passed (test data rolled back)';
end
$$;
