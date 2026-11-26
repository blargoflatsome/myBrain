-- Checks for what the TV reads (SPEC §9 The dashboard, What it reads). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  today constant date := '2026-11-26';
  snap jsonb;
  again jsonb;
  log_id uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.paired_devices (user_id, key_hash) values (alice, public.connect_hash('alice-tv-key'));

  insert into public.tasks (user_id, title, notes, due_date, status) values
    (alice, 'In the month', 'secret task notes', '2026-11-10', 'open'),
    (alice, 'Carried over', null, '2026-10-01', 'open'),
    (alice, 'Far away', null, '2027-03-01', 'open'),
    (alice, 'Due today', null, '2026-11-26', 'open'),
    (bob,   'Bob''s task', null, '2026-11-10', 'open');
  insert into public.events (user_id, title, notes, start_date, end_date, start_time, end_time, repeat) values
    (alice, 'Gym', 'secret event notes', '2026-11-26', '2026-11-26', '09:00', '10:00', 'never'),
    (bob,   'Bob''s party', null, '2026-11-26', '2026-11-26', '20:00', '22:00', 'never');
  insert into public.inbox (user_id, body) values (alice, 'secret orphan'), (alice, 'another');
  insert into public.journal_entries (user_id, date, body, has_writing, word_count) values (alice, today, '<p>secret journal</p>', true, 2);
  insert into public.habits (user_id, title, start_date) values (alice, 'Stretch', '2026-11-01');
  insert into public.habit_logs (user_id, habit_id, date, status, completed_at)
    select alice, h.id, '2026-11-25', 'completed', now() from public.habits h where h.user_id = alice returning id into log_id;

  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  snap := public.tv_snapshot('alice-tv-key', '2026-10-26', '2026-12-06', today);

  if jsonb_array_length(snap->'tasks') <> 3
     or not (snap->'tasks') @> '[{"title": "In the month"}, {"title": "Carried over"}, {"title": "Due today"}]' then
    raise exception 'FAIL: Spec §9: the TV gets my tasks in the shown weeks and carried-over ones, nobody else''s';
  end if;
  if jsonb_array_length(snap->'events') <> 1 or snap->'events'->0->>'title' <> 'Gym' then
    raise exception 'FAIL: Spec §9: the TV gets my events, not other people''s I wasn''t invited to';
  end if;
  if snap::text like '%secret%' then
    raise exception 'FAIL: Spec §9: the TV never reads notes, Orphans'' text or journal writing';
  end if;
  if (snap->>'orphans')::int <> 2 or not (snap->>'wrote_today')::boolean then
    raise exception 'FAIL: Spec §9: the TV gets how many Orphans wait and whether I wrote today';
  end if;
  if jsonb_array_length(snap->'habit_logs') <> 1 then raise exception 'FAIL: Spec §9: the first call has every habit log'; end if;

  -- After the first call, only the logs changed since.
  again := public.tv_snapshot('alice-tv-key', '2026-10-26', '2026-12-06', today, (snap->>'now')::timestamptz);
  if jsonb_array_length(again->'habit_logs') <> 0 then raise exception 'FAIL: Spec §9: later calls send only changed logs'; end if;
  reset role;
  update public.habit_logs set deleted_at = now() where id = log_id;
  execute 'set local role anon';
  -- (One transaction, so the change has the same time as the first call; ask from just before it.)
  again := public.tv_snapshot('alice-tv-key', '2026-10-26', '2026-12-06', today, (snap->>'now')::timestamptz - interval '1 second');
  if jsonb_array_length(again->'habit_logs') <> 1 or again->'habit_logs'->0->>'deleted_at' is null then
    raise exception 'FAIL: Spec §9: a deleted log comes through so the TV drops it';
  end if;

  -- While the calendar shows a month a year and more away, Your Day still has today's open tasks.
  again := public.tv_snapshot('alice-tv-key', '2028-02-27', '2028-04-08', today);
  if not (again->'tasks') @> '[{"title": "Due today"}, {"title": "Carried over"}]' then
    raise exception 'FAIL: Spec §9: Your Day gets today''s open tasks whichever month the calendar shows';
  end if;

  begin
    perform public.tv_snapshot('alice-tv-key', '2026-01-01', '2026-12-31', today);
    raise exception 'FAIL: Spec §9: the TV reads at most six weeks at a time';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.tv_snapshot('wrong-key', '2026-10-26', '2026-12-06', today);
    raise exception 'FAIL: Spec §9: a wrong key reads nothing';
  exception when sqlstate '28000' then null;
  end;

  raise exception 'PASS: all TV snapshot checks passed (test data rolled back)';
end
$$;
