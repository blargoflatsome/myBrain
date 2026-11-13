-- Checks for Locking my journal (SPEC §4, §5 Locking my journal, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  alice_key constant uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  n int;
  t2101 constant timestamptz := '2026-11-10 21:01:00-05';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob, 'bob@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York', journal_reminder_time = '21:00' where user_id = alice;
  insert into public.journal_keys (user_id, kdf_salt, kdf_iterations, key_by_passphrase, recovery_salt, key_by_recovery)
    values (bob, 's', 600000, 'k', 'r', 'k');
  insert into public.journal_passkeys (user_id, credential_id, name, prf_salt, wrapped_key) values (bob, 'c', 'Bob''s phone', 's', 'k');

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('journal_keys', 'journal_passkeys');
  if n <> 2 then raise exception 'FAIL: Spec §7: the journal lock syncs live through Realtime'; end if;

  -- The reminder reads has_writing: encrypted writing the server can't read still stops it.
  insert into public.journal_entries (user_id, date, body, has_writing, word_count) values (alice, '2026-11-10', 'enc:v1:AAAA', true, 5);
  select count(*) into n from public.due_reminders(t2101) where kind = 'journal' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: no reminder once I wrote today, even when the writing is encrypted'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.journal_keys;
  if n <> 0 then raise exception 'FAIL: Spec §8: only I can read my journal key'; end if;
  select count(*) into n from public.journal_passkeys;
  if n <> 0 then raise exception 'FAIL: Spec §8: only I can read my journal passkeys'; end if;

  begin
    insert into public.journal_keys (kdf_salt, kdf_iterations, key_by_passphrase, recovery_salt, key_by_recovery) values ('s', 1000, 'k', 'r', 'k');
    raise exception 'FAIL: Spec §8: the passphrase key needs at least 600,000 rounds';
  exception when check_violation then null;
  end;

  -- Plain writing is fine until I lock my journal.
  update public.journal_entries set body = 'plain words', tomorrow = 'plain too' where date = '2026-11-10';
  insert into public.journal_keys (id, kdf_salt, kdf_iterations, key_by_passphrase, recovery_salt, key_by_recovery) values (alice_key, 's', 600000, 'k', 'r', 'k');
  begin
    insert into public.journal_keys (kdf_salt, kdf_iterations, key_by_passphrase, recovery_salt, key_by_recovery) values ('s', 600000, 'k', 'r', 'k');
    raise exception 'FAIL: Spec §4: one live journal key per person';
  exception when unique_violation then null;
  end;

  -- Locked: the server refuses plain writing from any device, and accepts encrypted or empty writing.
  begin
    update public.journal_entries set body = 'still plain' where date = '2026-11-10';
    raise exception 'FAIL: Spec §5 Locking my journal: the server refuses plain writing once locked';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.journal_entries set body = 'enc:v1:AAAA', tomorrow = 'plain answer' where date = '2026-11-10';
    raise exception 'FAIL: Spec §5 Locking my journal: the server refuses a plain tomorrow answer once locked';
  exception when invalid_parameter_value then null;
  end;
  update public.journal_entries set body = 'enc:v1:BBBB', tomorrow = '' where date = '2026-11-10';
  insert into public.journal_entries (date, body) values ('2026-11-09', '');

  -- Turning it off (soft delete) lets plain writing upload again.
  update public.journal_keys set deleted_at = now() where id = alice_key;
  update public.journal_entries set body = 'plain again' where date = '2026-11-10';

  -- Delete my data (journal) removes the lock and passkeys with the entries.
  insert into public.journal_keys (kdf_salt, kdf_iterations, key_by_passphrase, recovery_salt, key_by_recovery) values ('s', 600000, 'k', 'r', 'k');
  insert into public.journal_passkeys (credential_id, name, prf_salt, wrapped_key) values ('c', 'My phone', 's', 'k');
  perform public.delete_my_data(array['journal']);
  execute 'reset role';
  select count(*) into n from public.journal_keys where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: Delete my data (journal) removes my journal key'; end if;
  select count(*) into n from public.journal_passkeys where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: Delete my data (journal) removes my journal passkeys'; end if;
  select count(*) into n from public.journal_keys where user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §8: Delete my data never touches other people''s journal keys'; end if;

  raise exception 'PASS: all journal lock checks passed (test data rolled back)';
end
$$;
