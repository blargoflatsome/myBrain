-- Checks for the focus room: anonymous dots, the wave count, Show me in the focus room and Focused together
-- (SPEC §4 focus_presence, §5 Focus timer, §5 Trophies, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  wave constant timestamptz := to_timestamp((floor(extract(epoch from now()) / 1800) + 1) * 1800);
  r jsonb;
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');
  select count(*) into n from public.profiles where user_id = alice and focus_room;
  if n <> 1 then raise exception 'FAIL: Spec §4: Show me in the focus room is on by default'; end if;
  execute 'set local role authenticated';

  -- Alice is alone: the room is empty, never faked, and it doesn't count as together.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  r := public.focus_room('work', now() + interval '20 minutes');
  if jsonb_array_length(r->'dots') <> 0 or (r->>'together')::boolean then
    raise exception 'FAIL: Spec §5 Focus timer: with no one else there the room is empty (got %)', r;
  end if;
  begin
    insert into public.focus_presence (user_id, phase, part_ends_at) values (alice, 'work', now());
    raise exception 'FAIL: Spec §8: check-ins only go through focus_room';
  exception when insufficient_privilege then null;
  end;

  -- Bob joins the next wave; Carol is focusing but has the room setting off.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  r := public.focus_room('wait', wave);
  if jsonb_array_length(r->'dots') <> 1 or not (r->>'together')::boolean then
    raise exception 'FAIL: Spec §5 Focus timer: Bob sees Alice''s dot (got %)', r;
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(r->'dots'->0) k) <> array['id', 's'] or length(r->'dots'->0->>'id') <> 8 then
    raise exception 'FAIL: Spec §5 Focus timer: a dot is only a short anonymous id and seconds left (got %)', r->'dots'->0;
  end if;
  select count(*) into n from public.focus_presence;
  if n <> 1 then raise exception 'FAIL: Spec §8: I only read my own check-in'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  update public.profiles set focus_room = false where user_id = carol;
  r := public.focus_room('work', now() + interval '10 minutes');
  if (r->>'together')::boolean then raise exception 'FAIL: Spec §5 Trophies: with Show me in the focus room off, it doesn''t count'; end if;
  if jsonb_array_length(r->'dots') <> 1 then raise exception 'FAIL: Spec §5 Focus timer: waiting for a wave isn''t a dot (got %)', r; end if;

  -- Alice: Carol isn't shown, Bob is waiting (a joiner, not a dot).
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  r := public.focus_room();
  if jsonb_array_length(r->'dots') <> 0 then raise exception 'FAIL: Spec §5 Focus timer: someone with the setting off has no dot (got %)', r; end if;
  if (r->>'joining')::int <> 1 then raise exception 'FAIL: Spec §5 Focus timer: the next wave says how many join (got %)', r; end if;
  if (r->>'together')::boolean then raise exception 'FAIL: Spec §5 Trophies: just looking never counts'; end if;
  begin
    perform public.focus_room('work', now() + interval '3 hours');
    raise exception 'FAIL: Spec §8: a part end far in the future is refused';
  exception when sqlstate '22023' then null;
  end;

  -- Leaving takes my dot away.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.focus_leave();
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  r := public.focus_room();
  if (r->>'joining')::int <> 0 then raise exception 'FAIL: Spec §5 Focus timer: stopping the timer leaves the room'; end if;

  -- However many are focusing, a check-in returns at most 40 dots (SPEC §5 Focus timer: small and calm).
  execute 'reset role';
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), 'many' || g || '@test.invalid', '{}', 'authenticated', 'authenticated' from generate_series(1, 45) g;
  insert into public.focus_presence (user_id, phase, part_ends_at)
  select u.id, 'work', now() + interval '10 minutes' from auth.users u where u.email like 'many%@test.invalid';
  execute 'set local role authenticated';
  r := public.focus_room();
  if jsonb_array_length(r->'dots') <> 40 then raise exception 'FAIL: Spec §5 Focus timer: at most 40 dots (got %)', jsonb_array_length(r->'dots'); end if;

  raise exception 'PASS: all focus room checks passed (test data rolled back)';
end
$$;
