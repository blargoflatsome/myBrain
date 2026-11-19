-- Checks for profiles: only connections see one, blocks hide it, no second in-app invitation (SPEC §5 Profiles, §8).
-- Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  party uuid;
  n int;
  got jsonb;
  ids uuid[];
  shown uuid;
  hidden_b uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{"full_name": "Alice Able"}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{"full_name": "Bob Baker"}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{"full_name": "Carol Cole"}', 'authenticated', 'authenticated');
  insert into public.badges (id, user_id, kind, earned_at, levels)
    values (gen_random_uuid(), bob, 'habit_streak', now(), '["2026-11-01T00:00:00Z"]');
  insert into public.connections (user_id, friend_id) values (alice, bob), (bob, alice), (alice, carol), (carol, alice);
  insert into public.events (id, user_id, title, start_date, start_time, end_date, end_time)
    values (gen_random_uuid(), alice, 'Birthday party', '2026-11-20', '19:00', '2026-11-20', '22:00') returning id into party;
  -- SPEC §5 The Vault, Shared Vaults: Bob shows one bucket on his profile and keeps another private.
  insert into public.vault_buckets (user_id, name, position, on_profile) values (bob, 'Books to lend', 9, true) returning id into shown;
  insert into public.vault_buckets (user_id, name, position) values (bob, 'Gift ideas for Alice', 10) returning id into hidden_b;
  insert into public.vault_items (user_id, bucket_id, title) values (bob, shown, 'Dune'), (bob, hidden_b, 'A secret');
  insert into public.vault_items (user_id, bucket_id, title, deleted_at) values (bob, shown, 'Gone', now());

  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'streak_visibility';
  if n <> 0 then raise exception 'FAIL: Spec §5 Profiles: there is no profile visibility setting'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  -- A connection's profile: name, picture and earned trophies
  select badges into got from public.connection_profile(bob);
  if got is null or jsonb_array_length(got) <> 1 or got -> 0 ->> 'kind' <> 'habit_streak' then
    raise exception 'FAIL: Spec §5 Profiles: a connection sees the other''s earned trophies';
  end if;

  -- SPEC §5 The Vault, Shared Vaults: only buckets shown on the profile, with their items (not deleted ones).
  select count(*) into n from public.connection_vault(bob);
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: a connection sees only the buckets shown on the profile (got %)', n; end if;
  select items into got from public.connection_vault(bob) where id = shown;
  if jsonb_array_length(got) <> 1 or got -> 0 ->> 'title' <> 'Dune' then raise exception 'FAIL: Spec §5 Shared Vaults: a shown bucket shows its items'; end if;
  select count(*) into n from public.vault_items where user_id = bob;
  if n <> 0 then raise exception 'FAIL: Spec §8: other people''s Vault items are only read through the profile function'; end if;

  -- Invite to event: once, and the profile says they're invited
  perform public.invite_people(party, jsonb_build_array(jsonb_build_object('user_id', bob)));
  perform public.invite_people(party, jsonb_build_array(jsonb_build_object('user_id', bob)));
  execute 'reset role';
  select count(*) into n from public.event_invites i join public.invite_recipients r on r.invite_id = i.id where i.event_id = party and r.user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §5 Profiles: inviting a connection already invited makes no second invitation (got %)', n; end if;
  execute 'set local role authenticated';
  select invited_events into ids from public.connection_profile(bob);
  if not (party = any(ids)) then raise exception 'FAIL: Spec §5 Profiles: the profile knows which of my events they''re invited to'; end if;

  -- Not connected, or blocked: nothing at all
  execute 'reset role';
  update public.connections set deleted_at = now() where (user_id = alice and friend_id = carol) or (user_id = carol and friend_id = alice);
  insert into public.connection_blocks (user_id, blocked_user) values (bob, alice);
  execute 'set local role authenticated';
  select count(*) into n from public.connection_profile(carol);
  if n <> 0 then raise exception 'FAIL: Spec §5 Profiles: only connections see a profile'; end if;
  select count(*) into n from public.connection_profile(bob);
  if n <> 0 then raise exception 'FAIL: Spec §5 Profiles: someone who blocked me can''t be seen'; end if;
  select count(*) into n from public.connection_vault(bob);
  if n <> 0 then raise exception 'FAIL: Spec §5 Shared Vaults: someone who blocked me shows no buckets'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.connection_vault(bob);
  if n <> 0 then raise exception 'FAIL: Spec §5 Shared Vaults: only connections see shown buckets'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.badges where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: other people''s badges are only read through the profile function'; end if;

  -- Without signing in: not at all
  execute 'set local role anon';
  begin
    perform public.connection_profile(bob);
    raise exception 'FAIL: Spec §5 Profiles: a profile can''t be read without signing in';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all profile checks passed (test data rolled back)';
end
$$;
