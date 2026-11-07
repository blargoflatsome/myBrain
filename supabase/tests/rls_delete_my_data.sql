-- Checks for "Delete my data" (SPEC §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  h uuid;
  r uuid;
  shared_event uuid;
  solo_event uuid;
  bobs_event uuid;
  n int;
  t text;
  wiped constant text[] := array['tasks', 'inbox', 'quests', 'vault_items', 'journal_entries', 'habits', 'habit_logs',
    'routines', 'routine_steps', 'routine_runs', 'priority_tasks', 'reminder_state', 'tags', 'item_tags'];
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob, 'bob@test.invalid', '{}', 'authenticated', 'authenticated');

  foreach t in array array[alice, bob]::text[] loop
    insert into public.tasks (user_id, title) values (t::uuid, 'task');
    insert into public.inbox (user_id, body) values (t::uuid, 'thought');
    insert into public.quests (user_id, title) values (t::uuid, 'quest');
    insert into public.vault_buckets (user_id, name, position) values (t::uuid, 'Books', 9);
    insert into public.vault_items (user_id, bucket_id, title) select t::uuid, b.id, 'item' from public.vault_buckets b where b.user_id = t::uuid limit 1;
    insert into public.journal_entries (user_id, date, body) values (t::uuid, '2026-11-10', 'diary');
    insert into public.habits (user_id, title) values (t::uuid, 'habit') returning id into h;
    insert into public.habit_logs (user_id, habit_id, date, status, completed_at) values (t::uuid, h, '2026-11-10', 'completed', now());
    insert into public.routines (user_id, title) values (t::uuid, 'routine') returning id into r;
    insert into public.routine_steps (user_id, routine_id, position, title) values (t::uuid, r, 0, 'step');
    insert into public.routine_runs (user_id, routine_id, date, started_at) values (t::uuid, r, '2026-11-10', now());
    insert into public.priority_tasks (user_id, title, reminder_time, due_date) values (t::uuid, 'meds', '08:00', '2026-11-10');
    insert into public.reminder_state (user_id, kind, item_id, date) values (t::uuid, 'habit', h, '2026-11-10');
    insert into public.tags (user_id, name) values (t::uuid, 'work');
    insert into public.item_tags (user_id, tag_id, item_type, item_id) select t::uuid, g.id, 'task', h from public.tags g where g.user_id = t::uuid;
    insert into public.availability_rules (user_id, weekday, start_time, end_time) values (t::uuid, 1, '09:00', '17:00');
  end loop;

  insert into public.events (user_id, title, start_date, end_date) values (alice, 'Solo', '2026-11-20', '2026-11-20') returning id into solo_event;
  insert into public.events (user_id, title, start_date, end_date) values (alice, 'Party', '2026-11-21', '2026-11-21') returning id into shared_event;
  insert into public.events (user_id, title, start_date, end_date) values (bob, 'Bob''s BBQ', '2026-11-22', '2026-11-22') returning id into bobs_event;
  update public.profiles set notify_ntfy = true, ntfy_topic = 'mybrain-0123456789abcdef', cancel_event_message = 'Custom {{name}}' where user_id = alice;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.invite_people(shared_event, '[{"name":"Carol","email":"carol@test.invalid"}]'::jsonb);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.invite_people(bobs_event, json_build_array(json_build_object('email', 'alice@test.invalid'))::jsonb);

  -- Alice deletes her data.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.delete_my_data();
  execute 'reset role';

  foreach t in array wiped loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using alice;
    if n <> 0 then raise exception 'FAIL: Spec §8 Delete my data: everything I added is removed (% left in %)', n, t; end if;
    execute format('select count(*) from public.%I where user_id = $1', t) into n using bob;
    if n = 0 then raise exception 'FAIL: Spec §8: deleting my data never touches anyone else''s (% emptied)', t; end if;
  end loop;

  select count(*) into n from public.vault_buckets where user_id = alice;
  if n <> 3 then raise exception 'FAIL: Spec §8 Delete my data: the Vault resets to the 3 starter buckets (got %)', n; end if;
  select count(*) into n from public.events where id = solo_event;
  if n <> 0 then raise exception 'FAIL: Spec §8 Delete my data: my own events are removed'; end if;
  select count(*) into n from public.events where id = shared_event and cancelled_at is null;
  if n <> 1 then raise exception 'FAIL: Spec §8 Delete my data: events I invited people to are left alone'; end if;
  select count(*) into n from public.event_invites i join public.invite_recipients x on x.invite_id = i.id where i.event_id = bobs_event and x.user_id = alice and i.deleted_at is null;
  if n <> 1 then raise exception 'FAIL: Spec §8 Delete my data: invitations I received are kept'; end if;
  select count(*) into n from public.availability_rules where user_id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §8 Delete my data: availability times are kept'; end if;
  select count(*) into n from public.profiles where user_id = alice and notify_ntfy and cancel_event_message = 'Custom {{name}}' and data_reset_at is not null;
  if n <> 1 then raise exception 'FAIL: Spec §8 Delete my data: settings are kept, and my devices are told to refresh'; end if;
  select count(*) into n from auth.users where id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §8 Delete my data: my account is kept'; end if;

  begin
    execute 'set local role anon';
    perform public.delete_my_data();
    raise exception 'FAIL: Spec §8: signed-out visitors cannot delete data';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all delete-my-data checks passed (test data rolled back)';
end
$$;
