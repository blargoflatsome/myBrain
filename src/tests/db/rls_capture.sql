-- Database rule checks for quick-capture tables (SPEC §2, §4, §5, §7, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  bob_bucket uuid;
  t text;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');

  select count(*) into n from public.vault_buckets
    where user_id = alice and name in ('Shopping list', 'Restaurant reviews', 'Places to go') and deleted_at is null;
  if n <> 3 then raise exception 'FAIL: Spec §5 The Vault: new accounts start with three starter buckets'; end if;

  select id into bob_bucket from public.vault_buckets where user_id = bob limit 1;
  insert into public.tasks (user_id, title) values (bob, 'bob task');
  insert into public.quests (user_id, title) values (bob, 'bob quest');
  insert into public.inbox (user_id, body) values (bob, 'bob thought');
  insert into public.vault_items (user_id, bucket_id, title) values (bob, bob_bucket, 'bob item');

  foreach t in array array['tasks', 'vault_buckets', 'vault_items', 'quests', 'inbox'] loop
    select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t;
    if n <> 1 then raise exception 'FAIL: Spec §7: % syncs live through Realtime', t; end if;
  end loop;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  foreach t in array array['tasks', 'vault_buckets', 'vault_items', 'quests', 'inbox'] loop
    execute format('select count(*) from public.%I where user_id <> %L', t, alice) into n;
    if n <> 0 then raise exception 'FAIL: Spec §2/§8: a user can read only their own % rows', t; end if;

    execute format('update public.%I set deleted_at = now() where user_id = %L', t, bob);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot change someone else''s % rows', t; end if;

    execute format('delete from public.%I', t);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete % rows (soft delete only)', t; end if;
  end loop;

  insert into public.tasks (title, source) values ('alice captured this', 'capture');
  select count(*) into n from public.tasks where user_id = alice and due_date is null and status = 'open';
  if n <> 1 then raise exception 'FAIL: Spec §5: a captured task belongs to its creator and lands Undated when no date is given'; end if;

  begin
    insert into public.tasks (user_id, title) values (bob, 'planted by alice');
    raise exception 'FAIL: Spec §8: a user cannot create rows for someone else';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.vault_items (bucket_id, title) values (bob_bucket, 'sneaky');
    raise exception 'FAIL: Spec §8: a user cannot put items in someone else''s bucket';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.inbox (body) values ('   ');
    raise exception 'FAIL: Spec §5: an empty capture is rejected';
  exception when check_violation then null;
  end;

  raise exception 'PASS: all capture-table rule checks passed (test data rolled back)';
end
$$;
