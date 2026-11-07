-- Checks for every-2-weeks repeating and the new journal and Vault fields (SPEC §5). Always rolls back.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  h uuid;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated');
  update public.profiles set timezone = 'America/New_York' where user_id = alice;

  -- Weeks run Sunday to Saturday; every 2 weeks counts from the week of the start date.
  if not public.on_week('2026-11-04', 2::smallint, '2026-11-02') then raise exception 'FAIL: Spec §5: the start week is an "on" week'; end if;
  if public.on_week('2026-11-04', 2::smallint, '2026-11-10') then raise exception 'FAIL: Spec §5: every 2 weeks skips the next week'; end if;
  if not public.on_week('2026-11-04', 2::smallint, '2026-11-17') then raise exception 'FAIL: Spec §5: every 2 weeks comes back the week after'; end if;
  if not public.on_week('2026-11-04', 1::smallint, '2026-11-10') then raise exception 'FAIL: Spec §5: every week is every week'; end if;

  -- An every-2-weeks habit is reminded only in its "on" weeks.
  insert into public.habits (user_id, title, notify_time, start_date, week_interval) values (alice, 'Water plants', '08:00', '2026-11-02', 2) returning id into h;
  select count(*) into n from public.due_reminders('2026-11-03 08:01:00-05') where item_id = h;
  if n <> 1 then raise exception 'FAIL: Spec §5: an every-2-weeks habit is reminded in its on week'; end if;
  select count(*) into n from public.due_reminders('2026-11-10 08:01:00-05') where item_id = h;
  if n <> 0 then raise exception 'FAIL: Spec §5: an every-2-weeks habit is not reminded in its off week'; end if;

  -- Events can repeat every 2 weeks.
  if not public.event_occurs_on('2026-11-03', 'biweekly', '2026-11-17') or public.event_occurs_on('2026-11-03', 'biweekly', '2026-11-10') then
    raise exception 'FAIL: Spec §5 Calendar: an every-2-weeks event repeats every other week';
  end if;
  begin
    insert into public.habits (user_id, title, week_interval) values (alice, 'Bad', 3);
    raise exception 'FAIL: Spec §5: how often is every week or every 2 weeks';
  exception when check_violation then null;
  end;

  -- Journal: "how to make tomorrow better" and "better than yesterday"; Vault buckets can be starred.
  insert into public.journal_entries (user_id, date, tomorrow, better_than_yesterday) values (alice, '2026-11-10', 'Go to bed earlier', true);
  update public.vault_buckets set starred = true where user_id = alice and name = 'Shopping list';
  select count(*) into n from public.vault_buckets where user_id = alice and starred;
  if n <> 1 then raise exception 'FAIL: Spec §5 The Vault: a bucket can be starred'; end if;

  raise exception 'PASS: all every-2-weeks, journal and favorites checks passed (test data rolled back)';
end
$$;
