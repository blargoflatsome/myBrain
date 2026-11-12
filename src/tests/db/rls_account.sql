-- Checks for account deletion (SPEC §9, §5 Account page). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  h uuid;
  r uuid;
  n int;
  t text;
  owned constant text[] := array[
    'profiles', 'tasks', 'vault_buckets', 'vault_items', 'quests', 'inbox', 'habits', 'habit_logs', 'routines',
    'routine_steps', 'routine_runs', 'priority_tasks', 'reminder_state', 'push_subscriptions', 'journal_entries'
  ];
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob, 'bob@test.invalid', '{}', 'authenticated', 'authenticated');

  -- Give both users some of everything.
  foreach t in array array[alice, bob]::text[] loop
    insert into public.tasks (user_id, title) values (t::uuid, 'task');
    insert into public.quests (user_id, title) values (t::uuid, 'quest');
    insert into public.vault_items (user_id, bucket_id, title)
      select t::uuid, b.id, 'item' from public.vault_buckets b where b.user_id = t::uuid limit 1;
    insert into public.inbox (user_id, body) values (t::uuid, 'thought');
    insert into public.habits (user_id, title) values (t::uuid, 'habit') returning id into h;
    insert into public.habit_logs (user_id, habit_id, date, status, completed_at) values (t::uuid, h, '2026-11-10', 'completed', now());
    insert into public.routines (user_id, title) values (t::uuid, 'routine') returning id into r;
    insert into public.routine_steps (user_id, routine_id, position, title) values (t::uuid, r, 0, 'step');
    insert into public.routine_runs (user_id, routine_id, date, started_at) values (t::uuid, r, '2026-11-10', now());
    insert into public.priority_tasks (user_id, title, reminder_time, due_date) values (t::uuid, 'meds', '08:00', '2026-11-10');
    insert into public.reminder_state (user_id, kind, item_id, date) values (t::uuid, 'habit', h, '2026-11-10');
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (t::uuid, 'https://push.invalid/' || t, 'k', 'a');
    insert into public.journal_entries (user_id, date, body) values (t::uuid, '2026-11-10', 'diary');
  end loop;

  -- Signed-out visitors cannot delete anyone.
  begin
    execute 'set local role anon';
    perform public.delete_my_account();
    raise exception 'FAIL: Spec §8: signed-out visitors cannot delete an account';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- Alice deletes her account.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.delete_my_account();
  execute 'reset role';

  select count(*) into n from auth.users where id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §9: Delete My Account removes the user'; end if;
  foreach t in array owned loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using alice;
    if n <> 0 then raise exception 'FAIL: Spec §9: Delete My Account removes everything (% rows left in %)', n, t; end if;
    execute format('select count(*) from public.%I where user_id = $1', t) into n using bob;
    if n = 0 then raise exception 'FAIL: Spec §8: deleting my account never touches anyone else''s data (% emptied)', t; end if;
  end loop;

  raise exception 'PASS: all account deletion checks passed (test data rolled back)';
end
$$;
