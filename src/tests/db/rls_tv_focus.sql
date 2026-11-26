-- Checks for the Focus timer on the TV (SPEC §9): the quiet room by device key, and finished sessions kept for
-- trophies. Always rolls back.
-- Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  session uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  room jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.paired_devices (user_id, key_hash) values (alice, public.connect_hash('alice-tv-key'));
  insert into public.focus_presence (user_id, phase, part_ends_at, checked_in_at) values (bob, 'work', now() + interval '10 minutes', now());

  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  room := public.tv_focus_room('alice-tv-key', 'work', now() + interval '25 minutes');
  if jsonb_array_length(room->'dots') <> 1 or not (room->>'together')::boolean then
    raise exception 'FAIL: Spec §9: the TV checks in to the focus room and sees the others';
  end if;
  reset role;
  if not exists (select 1 from public.focus_presence where user_id = alice and phase = 'work') then
    raise exception 'FAIL: Spec §9: the TV''s check-in shows me in the room';
  end if;
  execute 'set local role anon';

  -- A finished work part counts toward trophies, once even if sent twice.
  perform public.tv_log_focus('alice-tv-key', session, now(), true);
  perform public.tv_log_focus('alice-tv-key', session, now(), true);
  perform public.tv_focus_leave('alice-tv-key');
  reset role;
  if (select count(*) from public.activity_log where user_id = alice and kind = 'focus' and detail = '{"minutes": 25, "together": true}') <> 1 then
    raise exception 'FAIL: Spec §9: a Focus session finished on the TV is kept once for trophies';
  end if;
  if exists (select 1 from public.focus_presence where user_id = alice) then
    raise exception 'FAIL: Spec §9: a stopped timer on the TV leaves the room';
  end if;
  execute 'set local role anon';

  begin
    perform public.tv_log_focus('alice-tv-key', 'aaaaaaaa-0000-4000-8000-000000000002', now() - interval '3 days');
    raise exception 'FAIL: Spec §9: the TV keeps only a session that just ended';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.focus_room_as(alice, 'work', now() + interval '25 minutes');
    raise exception 'FAIL: Spec §9: nobody calls the room for someone else directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.tv_focus_room('wrong-key', 'work', now() + interval '25 minutes');
    raise exception 'FAIL: Spec §9: a wrong key can''t join the room';
  exception when sqlstate '28000' then null;
  end;

  raise exception 'PASS: all TV focus checks passed (test data rolled back)';
end
$$;
