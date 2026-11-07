-- Checks for the Journal (SPEC §5 Journal, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  n int;
  -- Tue Nov 10 2026 in New York (UTC-5).
  t2059 constant timestamptz := '2026-11-10 20:59:00-05';
  t2101 constant timestamptz := '2026-11-10 21:01:00-05';
  t2301 constant timestamptz := '2026-11-10 23:01:00-05';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob, 'bob@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id in (alice, bob);
  insert into public.journal_entries (user_id, date, body) values (bob, '2026-11-09', 'Bob''s private day');

  -- The journal reminder is off by default.
  select count(*) into n from public.due_reminders(t2101) where kind = 'journal' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: the journal reminder is off by default'; end if;

  -- Due at the chosen local time; opens the journal.
  update public.profiles set journal_reminder_time = '21:00' where user_id = alice;
  select count(*) into n from public.due_reminders(t2059) where kind = 'journal' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: the journal reminder waits for its time'; end if;
  select count(*) into n from public.due_reminders(t2101) where kind = 'journal' and user_id = alice and url = '/journal' and not is_priority;
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: the journal reminder is sent at the chosen time'; end if;
  select count(*) into n from public.reminder_text('journal', 'Journal', false) where body = 'Reminder: Past you asked that you journal today.';
  if n <> 1 then raise exception 'FAIL: Spec §2: the journal reminder uses the approved wording'; end if;

  -- An entry with only stats (or written by the app) still gets the reminder; writing stops it.
  insert into public.journal_entries (user_id, date, stats, auto) values (alice, '2026-11-10', '{"tasks":{"done":1,"due":2}}', false);
  select count(*) into n from public.due_reminders(t2101) where kind = 'journal' and user_id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: an entry with no writing still gets the reminder'; end if;
  update public.journal_entries set body = 'Good day.' where user_id = alice and date = '2026-11-10';
  select count(*) into n from public.due_reminders(t2101) where kind = 'journal' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: no reminder once I wrote something today'; end if;

  -- Quiet hours hold it (it is not a priority reminder).
  update public.journal_entries set body = '' where user_id = alice and date = '2026-11-10';
  update public.profiles set journal_reminder_time = '23:00', quiet_hours_start = '22:00', quiet_hours_end = '07:00' where user_id = alice;
  select count(*) into n from public.due_reminders(t2301) where kind = 'journal' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: the journal reminder respects quiet hours'; end if;

  -- Quests record when they were completed.
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'quests' and column_name = 'completed_at';
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: quests record when they were completed'; end if;

  -- Act as Alice.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.journal_entries where user_id = bob;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot read someone else''s journal'; end if;

  update public.journal_entries set body = 'hacked' where user_id = bob;
  execute 'reset role';
  select count(*) into n from public.journal_entries where user_id = bob and body = 'hacked';
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot change someone else''s journal'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  begin
    insert into public.journal_entries (date, body) values ('2026-11-10', 'second entry');
    raise exception 'FAIL: Spec §5 Journal: one entry per day';
  exception when unique_violation then null;
  end;

  begin
    delete from public.journal_entries where user_id = alice;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: Spec §7: journal entries are soft-deleted, never hard-deleted'; end if;
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  begin
    execute 'set local role anon';
    perform 1 from public.journal_entries;
    raise exception 'FAIL: Spec §8: signed-out visitors cannot read journals';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all journal checks passed (test data rolled back)';
end
$$;
