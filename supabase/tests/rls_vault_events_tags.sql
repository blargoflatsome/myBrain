-- Checks for step 9: The Vault, events and their reminders, tags (SPEC §5, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  dentist uuid;
  standup uuid;
  bday uuid;
  bob_tag uuid;
  n int;
  -- Tue Nov 10 2026 in New York (UTC-5).
  t1429 constant timestamptz := '2026-11-10 14:29:00-05';
  t1431 constant timestamptz := '2026-11-10 14:31:00-05';
  t1516 constant timestamptz := '2026-11-10 15:16:00-05';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob, 'bob@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id in (alice, bob);

  -- The Vault: the Shopping list starts as a checklist; ratings are 1 to 5.
  select count(*) into n from public.vault_buckets where user_id = alice and name = 'Shopping list' and checkable;
  if n <> 1 then raise exception 'FAIL: Spec §5 The Vault: the Shopping list starts with check-off on'; end if;
  begin
    insert into public.vault_items (user_id, bucket_id, title, rating)
      select alice, id, 'Too good', 6 from public.vault_buckets where user_id = alice limit 1;
    raise exception 'FAIL: Spec §5 The Vault: star ratings are 1 to 5';
  exception when check_violation then null;
  end;

  -- Events: a 3 pm dentist today with a 30-minute reminder.
  insert into public.events (user_id, title, start_date, start_time, end_date, end_time, reminder_minutes)
    values (alice, 'Dentist', '2026-11-10', '15:00', '2026-11-10', '16:00', 30) returning id into dentist;
  select count(*) into n from public.due_reminders(t1429) where item_id = dentist;
  if n <> 0 then raise exception 'FAIL: Spec §5 Calendar: an event reminder waits until its time'; end if;
  select count(*) into n from public.due_reminders(t1431) where item_id = dentist and kind = 'event' and url = '/calendar?date=2026-11-10' and detail = '3:00 pm';
  if n <> 1 then raise exception 'FAIL: Spec §5 Calendar: an event reminder is sent the chosen minutes before, opening the calendar on that day'; end if;
  select count(*) into n from public.due_reminders(t1516) where item_id = dentist;
  if n <> 0 then raise exception 'FAIL: Spec §5 Calendar: no reminder once the event is well under way'; end if;
  select count(*) into n from public.reminder_text('event', 'Dentist', false, '3:00 pm') where body = 'Past you put this on the calendar. Starts at 3:00 pm.';
  if n <> 1 then raise exception 'FAIL: Spec §2: the event reminder uses the approved wording'; end if;

  -- A weekly event repeats on the same weekday; a monthly one on the same date.
  insert into public.events (user_id, title, start_date, start_time, end_date, end_time, repeat, reminder_minutes)
    values (alice, 'Standup', '2026-10-27', '14:45', '2026-10-27', '15:00', 'weekly', 15) returning id into standup;
  select count(*) into n from public.due_reminders(t1431) where item_id = standup;
  if n <> 1 then raise exception 'FAIL: Spec §5 Calendar: a weekly event repeats on its weekday'; end if;
  if public.event_occurs_on('2026-10-27', 'weekly', '2026-11-11') then raise exception 'FAIL: Spec §5 Calendar: a weekly event skips other weekdays'; end if;
  if not public.event_occurs_on('2026-01-31', 'monthly', '2026-03-31') or public.event_occurs_on('2026-01-31', 'monthly', '2026-02-28') then
    raise exception 'FAIL: Spec §5 Calendar: a monthly event repeats on its date and skips months without it';
  end if;
  if not public.event_occurs_on('2026-11-09', 'weekdays', '2026-11-13') or public.event_occurs_on('2026-11-09', 'weekdays', '2026-11-14') then
    raise exception 'FAIL: Spec §5 Calendar: a weekdays event repeats Monday to Friday only';
  end if;

  -- An all-day event with a "1 day before" reminder is reminded at 9:00 am the day before.
  insert into public.events (user_id, title, start_date, end_date, repeat, reminder_minutes)
    values (alice, 'Mum''s birthday', '2020-11-11', '2020-11-11', 'yearly', 1440) returning id into bday;
  select count(*) into n from public.due_reminders('2026-11-10 08:59:00-05') where item_id = bday;
  if n <> 0 then raise exception 'FAIL: Spec §5 Calendar: an all-day reminder counts from 9:00 am'; end if;
  select count(*) into n from public.due_reminders('2026-11-10 09:01:00-05') where item_id = bday and local_date = '2026-11-11' and detail is null;
  if n <> 1 then raise exception 'FAIL: Spec §5 Calendar: a "1 day before" reminder for an all-day yearly event'; end if;

  -- Quiet hours hold event reminders.
  update public.profiles set quiet_hours_start = '14:00', quiet_hours_end = '16:00' where user_id = alice;
  select count(*) into n from public.due_reminders(t1431) where item_id = dentist;
  if n <> 0 then raise exception 'FAIL: Spec §6: quiet hours hold event reminders'; end if;
  update public.profiles set quiet_hours_start = null, quiet_hours_end = null where user_id = alice;

  -- Tags: one per name per user, ignoring case; a tag can only be used by its owner.
  insert into public.tags (user_id, name) values (bob, 'work') returning id into bob_tag;
  insert into public.tags (user_id, name) values (alice, 'Work');
  begin
    insert into public.tags (user_id, name) values (alice, 'WORK');
    raise exception 'FAIL: Spec §5 Tags: one tag per name, ignoring case';
  exception when unique_violation then null;
  end;
  begin
    insert into public.item_tags (user_id, tag_id, item_type, item_id) values (alice, bob_tag, 'event', dentist);
    raise exception 'FAIL: Spec §8: I cannot use someone else''s tag';
  exception when foreign_key_violation then null;
  end;

  -- Act as Bob: Alice's events and tags are invisible and unchangeable.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.events where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot read someone else''s events'; end if;
  select count(*) into n from public.tags where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot read someone else''s tags'; end if;
  update public.events set title = 'hacked' where id = dentist;
  begin
    perform public.due_reminders(now());
    raise exception 'FAIL: Spec §8: signed-in users cannot run the reminder job';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  select count(*) into n from public.events where id = dentist and title = 'hacked';
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot change someone else''s events'; end if;

  raise exception 'PASS: all vault, event and tag checks passed (test data rolled back)';
end
$$;
