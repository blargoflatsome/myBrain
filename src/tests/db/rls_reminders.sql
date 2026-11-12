-- Checks for the reminder job (SPEC §5 priority reminders, §6 Notifications). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  meds uuid;
  stretch uuid;
  morning uuid;
  insulin uuid;
  once uuid;
  n int;
  -- Tue Nov 10 2026 in New York (UTC-5).
  t0759 constant timestamptz := '2026-11-10 07:59:00-05';
  t0801 constant timestamptz := '2026-11-10 08:01:00-05';
  t2301 constant timestamptz := '2026-11-10 23:01:00-05';
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id = alice;

  insert into public.habits (user_id, title, notify_time, start_date, is_priority) values (alice, 'Meds', '08:00', '2026-11-01', true) returning id into meds;
  insert into public.habits (user_id, title, notify_time, start_date) values (alice, 'Stretch', '08:00', '2026-11-01') returning id into stretch;
  insert into public.routines (user_id, title, notify_time, start_date) values (alice, 'Morning', '08:00', '2026-11-01') returning id into morning;
  insert into public.priority_tasks (user_id, title, reminder_time, weekdays, start_date) values (alice, 'Insulin', '08:00', '{1,2,3,4,5}', '2026-11-01') returning id into insulin;
  insert into public.priority_tasks (user_id, title, reminder_time, due_date) values (alice, 'Once', '08:00', '2026-11-12') returning id into once;

  -- Due at the reminder time, in the user's own timezone.
  select count(*) into n from public.due_reminders(t0759) where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §6: nothing is due before its local reminder time'; end if;
  select count(*) into n from public.due_reminders(t0801) where user_id = alice;
  if n <> 4 then raise exception 'FAIL: Spec §6: habits, routine and weekday priority task are due at 8:01 local (got %)', n; end if;
  select count(*) into n from public.due_reminders(t0801) where item_id = once;
  if n <> 0 then raise exception 'FAIL: Spec §5: a one-off priority task is only due on its date'; end if;
  select count(*) into n from public.due_reminders(t0801) where item_id = meds and is_priority;
  if n <> 1 then raise exception 'FAIL: Spec §5: a priority habit is sent as a priority reminder'; end if;
  select count(*) into n from public.due_reminders(t0801) where item_id = morning and url = '/routines/' || morning || '/run';
  if n <> 1 then raise exception 'FAIL: Spec §5 Routines: a routine reminder opens the routine in progress'; end if;

  -- Completed items are not sent.
  insert into public.habit_logs (user_id, habit_id, date, status, completed_at) values (alice, stretch, '2026-11-10', 'completed', t0759);
  select count(*) into n from public.due_reminders(t0801) where item_id = stretch;
  if n <> 0 then raise exception 'FAIL: Spec §6: a completed habit is not reminded'; end if;

  -- Sent once a day; again only after a snooze runs out.
  insert into public.reminder_state (user_id, kind, item_id, date, last_sent_at) values (alice, 'habit', meds, '2026-11-10', t0801);
  select count(*) into n from public.due_reminders(t0801 + interval '5 minutes') where item_id = meds;
  if n <> 0 then raise exception 'FAIL: Spec §6: a reminder is not re-sent on its own'; end if;
  update public.reminder_state set snoozed_until = t0801 + interval '10 minutes' where item_id = meds;
  select count(*) into n from public.due_reminders(t0801 + interval '9 minutes') where item_id = meds;
  if n <> 0 then raise exception 'FAIL: Spec §5: a snoozed reminder waits for the snooze to end'; end if;
  select count(*) into n from public.due_reminders(t0801 + interval '11 minutes') where item_id = meds;
  if n <> 1 then raise exception 'FAIL: Spec §5: a snoozed reminder comes back after 10 minutes'; end if;

  -- Cancel stops it for the day.
  insert into public.reminder_state (user_id, kind, item_id, date, cancelled_at) values (alice, 'priority_task', insulin, '2026-11-10', t0801);
  select count(*) into n from public.due_reminders(t0801 + interval '1 hour') where item_id = insulin;
  if n <> 0 then raise exception 'FAIL: Spec §5: a cancelled priority reminder is not sent again today'; end if;

  -- Quiet hours hold ordinary reminders, but priority ones still ring (unless chosen otherwise).
  update public.profiles set quiet_hours_start = '22:00', quiet_hours_end = '07:00' where user_id = alice;
  delete from public.reminder_state where item_id = meds;
  select count(*) into n from public.due_reminders(t2301) where item_id = morning;
  if n <> 0 then raise exception 'FAIL: Spec §6: quiet hours hold ordinary reminders'; end if;
  select count(*) into n from public.due_reminders(t2301) where item_id = meds;
  if n <> 1 then raise exception 'FAIL: Spec §5: priority reminders ring during quiet hours by default'; end if;
  update public.profiles set quiet_hours_silence_priority = true where user_id = alice;
  select count(*) into n from public.due_reminders(t2301) where item_id = meds;
  if n <> 0 then raise exception 'FAIL: Spec §5: priority reminders can be silenced in quiet hours if I choose'; end if;

  -- The job records what it sent and when (so it does not repeat).
  update public.profiles set quiet_hours_start = null, quiet_hours_end = null, quiet_hours_silence_priority = false where user_id = alice;
  perform public.send_due_reminders(t0801 + interval '2 hours');
  select count(*) into n from public.reminder_state where item_id = meds and last_sent_at = t0801 + interval '2 hours';
  if n <> 1 then raise exception 'FAIL: Spec §6: sending a reminder records when it was sent'; end if;

  -- Other users cannot run the job or read anyone's subscriptions.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  begin
    perform public.due_reminders(now());
    raise exception 'FAIL: Spec §8: signed-in users cannot run the reminder job';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all reminder checks passed (test data rolled back)';
end
$$;
