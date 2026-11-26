-- Checks for Go on a Quest on the TV (SPEC §9): what the draw reads and the writes it may make. Always rolls back.
-- Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  today constant date := current_date;
  hike    uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  paint   uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  bobs    uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  stamps  uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  later   uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  bob_task uuid := 'bbbbbbbb-0000-4000-8000-000000000003';
  log_id  uuid := 'cccccccc-0000-4000-8000-000000000001';
  draw jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.paired_devices (user_id, key_hash) values (alice, public.connect_hash('alice-tv-key'));
  insert into public.quests (id, user_id, title, details, status) values
    (hike,  alice, 'Go for a hike', 'Bring water', 'open'),
    (paint, alice, 'Paint the fence', null, 'accepted'),
    (bobs,  bob,   'Bob''s quest', null, 'open');
  insert into public.tasks (id, user_id, title, due_date, status) values
    (stamps,   alice, 'Buy stamps', null, 'open'),
    (later,    alice, 'Next week', today + 7, 'open'),
    (bob_task, bob,   'Bob''s task', null, 'open');

  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  draw := public.tv_quest_draw('alice-tv-key');
  if jsonb_array_length(draw->'quests') <> 2 or draw::text like '%Bob''s%' or draw::text not like '%Bring water%' then
    raise exception 'FAIL: Spec §9: the draw gets my open and accepted quests with their details, nobody else''s';
  end if;
  if jsonb_array_length(draw->'tasks') <> 1 or (draw->'tasks'->0->>'id')::uuid <> stamps then
    raise exception 'FAIL: Spec §9: the draw gets my tasks that can be in it (today''s and Undated), not next week''s';
  end if;

  -- Picked, then done: counted, logged once (even pressed twice), and back in the list.
  perform public.tv_save_quest('alice-tv-key', hike, 'pick');
  perform public.tv_save_quest('alice-tv-key', paint, 'done', today, log_id);
  perform public.tv_save_quest('alice-tv-key', paint, 'done', today, log_id);
  reset role;
  if (select times_picked from public.quests where id = hike) <> 1 or (select last_picked_at from public.quests where id = hike) is null then
    raise exception 'FAIL: Spec §9: a pick on the TV counts, so recent picks are skipped';
  end if;
  if (select status from public.quests where id = paint) <> 'open'
     or (select count(*) from public.quest_logs where quest_id = paint and deleted_at is null) <> 1 then
    raise exception 'FAIL: Spec §9: Mark done on the TV logs one completion and puts the quest back in the list';
  end if;
  execute 'set local role anon';

  -- Undo puts it back as it was, and takes the completion off the log.
  perform public.tv_save_quest('alice-tv-key', paint, 'undo_done', null, log_id, 'accepted', null);
  reset role;
  if (select status from public.quests where id = paint) <> 'accepted'
     or exists (select 1 from public.quest_logs where quest_id = paint and deleted_at is null) then
    raise exception 'FAIL: Spec §9: Undo of Mark done on the TV puts the quest back and removes its completion';
  end if;
  execute 'set local role anon';

  perform public.tv_save_quest('alice-tv-key', hike, 'accept');
  perform public.tv_save_draw_task('alice-tv-key', stamps, 'today', today);
  perform public.tv_save_draw_task('alice-tv-key', stamps, 'done', today);
  reset role;
  if (select status from public.quests where id = hike) <> 'accepted' then
    raise exception 'FAIL: Spec §9: I''ll do it on the TV moves the quest to In progress';
  end if;
  if (select due_date from public.tasks where id = stamps) <> today or (select status from public.tasks where id = stamps) <> 'done' then
    raise exception 'FAIL: Spec §9: a task from the draw can be given today''s date and crossed off';
  end if;
  execute 'set local role anon';

  begin
    perform public.tv_save_quest('alice-tv-key', bobs, 'pick');
    raise exception 'FAIL: Spec §9: the TV can''t pick someone else''s quest';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tv_save_draw_task('alice-tv-key', bob_task, 'done', today);
    raise exception 'FAIL: Spec §9: the TV can''t cross off someone else''s task';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tv_save_draw_task('alice-tv-key', later, 'done', today);
    raise exception 'FAIL: Spec §9: the TV crosses off only a task that can be in the draw';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tv_save_quest('alice-tv-key', hike, 'delete');
    raise exception 'FAIL: Spec §9: the TV makes only the quest writes it needs';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.tv_quest_draw('wrong-key');
    raise exception 'FAIL: Spec §9: a wrong key reads nothing';
  exception when sqlstate '28000' then null;
  end;

  raise exception 'PASS: all TV quest checks passed (test data rolled back)';
end
$$;
