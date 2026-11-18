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

  -- SPEC §5 Journal: the evening reminder is on at 9:00 pm by default, waits for its time, opens the Dashboard, and
  -- says how many things for today are left (here just the journal).
  select count(*) into n from public.due_reminders(t2059) where kind = 'evening' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: the evening reminder waits for its time'; end if;
  select count(*) into n from public.due_reminders(t2101) where kind = 'evening' and user_id = alice and url = '/' and not is_priority and detail = E'1\nyour journal';
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: the evening reminder is on at 9:00 pm by default, counting the unwritten journal'; end if;
  select count(*) into n from public.reminder_text('evening', 'Evening check-in', false, E'1\nyour journal')
    where body = 'Past you left you 1 thing for today: your journal. Want to take a look before bed?';
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: the evening reminder says one thing and names it'; end if;

  -- Open tasks due today or carried over count; done, cancelled, undated and future ones don't.
  insert into public.tasks (user_id, title, due_date, status) values
    (alice, 'Today', '2026-11-10', 'open'), (alice, 'Carried', '2026-11-08', 'open'), (alice, 'Done', '2026-11-10', 'done'),
    (alice, 'Cancelled', '2026-11-10', 'cancelled'), (alice, 'Undated', null, 'open'), (alice, 'Tomorrow', '2026-11-11', 'open');
  select count(*) into n from public.due_reminders(t2101) where kind = 'evening' and user_id = alice and detail = E'3\nCarried, Today and your journal';
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: the evening reminder counts and names open tasks due today or carried over'; end if;
  -- Past 3, it names 3 and says how many more.
  insert into public.tasks (user_id, title, due_date, status) values (alice, 'Also today', '2026-11-10', 'open');
  select count(*) into n from public.due_reminders(t2101) where kind = 'evening' and user_id = alice and detail = E'4\nAlso today, Carried, Today and 1 more';
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: the evening reminder names up to 3 things, then how many more'; end if;
  update public.tasks set status = 'done' where user_id = alice and title = 'Also today';

  -- An entry with only stats (or written by the app) still counts; writing stops the journal counting.
  insert into public.journal_entries (user_id, date, stats, auto) values (alice, '2026-11-10', '{"tasks":{"done":1,"due":2}}', false);
  select count(*) into n from public.due_reminders(t2101) where kind = 'evening' and user_id = alice and split_part(detail, E'\n', 1) = '3';
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: an entry with no writing still counts'; end if;
  -- The app stores has_writing with the writing (SPEC §5 Locking my journal); the reminder reads it.
  update public.journal_entries set body = 'Good day.', has_writing = true, word_count = 2 where user_id = alice and date = '2026-11-10';
  select count(*) into n from public.due_reminders(t2101) where kind = 'evening' and user_id = alice and split_part(detail, E'\n', 1) = '2';
  if n <> 1 then raise exception 'FAIL: Spec §5 Journal: writing today stops the journal counting'; end if;

  -- Nothing left: nothing is sent.
  update public.tasks set status = 'done' where user_id = alice;
  select count(*) into n from public.due_reminders(t2101) where kind = 'evening' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: no evening reminder when nothing is left'; end if;

  -- It can be turned off, and quiet hours hold it (it is not a priority reminder).
  update public.journal_entries set body = '', has_writing = false, word_count = 0 where user_id = alice and date = '2026-11-10';
  update public.profiles set evening_reminder_time = null where user_id = alice;
  select count(*) into n from public.due_reminders(t2101) where kind = 'evening' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: the evening reminder can be turned off'; end if;
  update public.profiles set evening_reminder_time = '23:00', quiet_hours_start = '22:00', quiet_hours_end = '07:00' where user_id = alice;
  select count(*) into n from public.due_reminders(t2301) where kind = 'evening' and user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Journal: the evening reminder respects quiet hours'; end if;

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
