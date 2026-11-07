-- Security sweep checks (SPEC §8 Security): size limits, https-only addresses, safe people search. Always rolls back.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  update public.profiles set display_name = 'Bob Builder', findable = true where user_id = bob;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  -- Size limits stop storage abuse.
  begin
    insert into public.tasks (title) values (repeat('x', 501));
    raise exception 'FAIL: Spec §8: a task title is at most 500 characters';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks (title, notes) values ('ok', repeat('x', 20001));
    raise exception 'FAIL: Spec §8: task notes are at most 20000 characters';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (title, start_date, end_date) values (repeat('x', 501), '2026-11-10', '2026-11-10');
    raise exception 'FAIL: Spec §8: an event title is at most 500 characters';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set display_name = repeat('x', 121) where user_id = alice;
    raise exception 'FAIL: Spec §8: a display name is at most 120 characters';
  exception when check_violation then null;
  end;
  -- Normal long text still saves, including a formatted "tomorrow" answer longer than the old 5000 limit.
  insert into public.tasks (title, notes) values (repeat('t', 500), repeat('n', 20000));
  insert into public.journal_entries (date, body, tomorrow) values ('2026-11-10', repeat('<p>x</p>', 20000), repeat('<p>y</p>', 2000));

  -- Pictures and push addresses must be https.
  begin
    update public.profiles set avatar_url = 'javascript:alert(1)' where user_id = alice;
    raise exception 'FAIL: Spec §8: a profile picture address must be https';
  exception when check_violation then null;
  end;
  begin
    insert into public.push_subscriptions (endpoint, p256dh, auth) values ('http://169.254.169.254/latest', 'k', 'a');
    raise exception 'FAIL: Spec §8: a push address must be https';
  exception when check_violation then null;
  end;

  -- People search: wildcards and escape characters can't list everyone or make the search fail.
  select count(*) into n from public.search_people('%%%');
  if n <> 0 then raise exception 'FAIL: Spec §8: a search of only wildcards finds no one'; end if;
  select count(*) into n from public.search_people('___');
  if n <> 0 then raise exception 'FAIL: Spec §8: a search of only underscores finds no one'; end if;
  select count(*) into n from public.search_people('Bob\');
  if n <> 1 then raise exception 'FAIL: Spec §8: a trailing backslash is ignored, not an error'; end if;
  select count(*) into n from public.search_people('Bob''; drop table public.tasks; --');
  if n <> 0 then raise exception 'FAIL: Spec §8: quotes in a search are just text'; end if;
  select count(*) into n from public.tasks;
  if n = 0 then raise exception 'FAIL: Spec §8: a search can never run SQL'; end if;

  raise exception 'PASS: all security checks passed (test data rolled back)';
end
$$;
