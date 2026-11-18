-- Checks for Cheers: anonymous posts, reactions, hiding someone, the post limit, getting unstuck and the tally
-- (SPEC §4, §5 Cheers, §5 Trophies, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  bob_post uuid;
  bob_stuck uuid;
  alice_post uuid;
  n int;
  i int;
  ok boolean;
  f record;
  t record;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');
  execute 'set local role authenticated';

  -- Bob posts.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  bob_post := public.post_cheer('did_it', 'I finished a 4-day-old task');
  bob_stuck := public.post_cheer('stuck', 'this text is dropped');
  select body into f from public.cheer_feed() where id = bob_stuck;
  if f.body <> '' then raise exception 'FAIL: Spec §5 Cheers: I''m stuck has no text'; end if;
  begin
    perform public.post_cheer('did_it', repeat('x', 141));
    raise exception 'FAIL: Spec §5 Cheers: I did it! is up to 140 characters';
  exception when string_data_right_truncation then null;
  end;
  begin
    insert into public.cheer_posts (user_id, kind, body) values (bob, 'did_it', 'straight in');
    raise exception 'FAIL: Spec §8: posts are only made through post_cheer (its limits)';
  exception when insufficient_privilege then null;
  end;

  -- Alice and Carol cheer Bob on.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.cheer_posts where user_id = bob;
  if n <> 0 then raise exception 'FAIL: Spec §5 Cheers: nobody can read who wrote a post'; end if;
  select * into f from public.cheer_feed() where id = bob_post;
  if f.mine or f.got_this is not null then raise exception 'FAIL: Spec §5 Cheers: only the poster sees the counts'; end if;
  ok := public.react_cheer(bob_stuck, 'strength');
  ok := public.react_cheer(bob_stuck, 'proud');
  if ok then raise exception 'FAIL: Spec §5 Cheers: one reaction per person per post, final once picked'; end if;
  select my_reaction into f from public.cheer_feed() where id = bob_stuck;
  if f.my_reaction <> 'strength' then raise exception 'FAIL: Spec §5 Cheers: I see the one I picked'; end if;
  -- Taking it back and picking again changes my pick but never counts twice.
  perform public.unreact_cheer(bob_stuck);
  select my_reaction into f from public.cheer_feed() where id = bob_stuck;
  if f.my_reaction is not null then raise exception 'FAIL: Spec §5 Cheers: tapping my reaction again takes it back'; end if;
  ok := public.react_cheer(bob_stuck, 'strength');
  if not ok then raise exception 'FAIL: Spec §5 Cheers: after taking it back I can pick again'; end if;
  select * into t from public.trophy_counts();
  if t.cheers_given <> 1 or t.cheer_firsts <> 1 then raise exception 'FAIL: Spec §5 Trophies: picking again doesn''t count twice (got %)', row_to_json(t); end if;
  alice_post := public.post_cheer('did_it', 'Alice did a thing');
  begin
    perform public.react_cheer(alice_post, 'proud');
    raise exception 'FAIL: Spec §5 Cheers: no reacting to my own post';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  perform public.react_cheer(bob_stuck, 'got_this');
  perform public.react_cheer(bob_post, 'celebrate');

  -- Bob sees his counts, and how many others are stuck leaves him out.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select * into f from public.cheer_feed() where id = bob_stuck;
  if not f.mine or f.strength <> 1 or f.got_this <> 1 or f.proud <> 0 then raise exception 'FAIL: Spec §5 Cheers: the poster sees each reaction''s count'; end if;
  if public.cheer_stuck_count() <> 0 then raise exception 'FAIL: Spec §5 Cheers: the stuck count leaves me out'; end if;
  if not public.cheer_am_stuck() then raise exception 'FAIL: Spec §5 Cheers: I''m stuck today, so I got unstuck! is offered'; end if;

  -- Bob gets unstuck: Alice and Carol are told, and it counts for them.
  perform public.post_cheer('unstuck', '');
  if public.cheer_am_stuck() then raise exception 'FAIL: Spec §5 Cheers: I got unstuck! is offered once per stuck post'; end if;
  begin
    perform public.post_cheer('unstuck', '');
    raise exception 'FAIL: Spec §5 Cheers: I got unstuck! needs a stuck post today';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.notifications where kind = 'cheer_unstuck' and item_id = bob_stuck;
  if n <> 1 then raise exception 'FAIL: Spec §5 Cheers: everyone who reacted to a stuck post hears they got unstuck'; end if;
  select * into t from public.trophy_counts();
  if t.cheers_given <> 1 or t.cheer_days <> 1 or t.cheer_firsts <> 1 or t.cheer_unstuck <> 1 or t.cheer_while_stuck then
    raise exception 'FAIL: Spec §5 Trophies: my Cheers tally (got %)', row_to_json(t);
  end if;

  -- Alice hides Bob from one of his posts: his posts go, she can't see who it was, and he can't be cheered by her.
  perform public.block_cheer_author(bob_post);
  select count(*) into n from public.cheer_feed() where id in (bob_post, bob_stuck);
  if n <> 0 then raise exception 'FAIL: Spec §5 Cheers: hiding someone hides all their posts'; end if;
  begin
    select count(*) into n from public.cheer_blocks;
    raise exception 'FAIL: Spec §5 Cheers: I never see who I hid';
  exception when insufficient_privilege then null;
  end;

  -- The poster hears once, at 4 reactions; Carol posts stuck then cheers (Cheering while stuck); the post limit.
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  perform public.post_cheer('stuck', '');
  perform public.react_cheer(alice_post, 'proud');
  select * into t from public.trophy_counts();
  if not t.cheer_while_stuck then raise exception 'FAIL: Spec §5 Trophies: cheering on a day I posted I''m stuck counts'; end if;
  -- Carol's stuck post was her first; nine more make ten.
  for i in 2..10 loop perform public.post_cheer('did_it', 'post ' || i); end loop;
  begin
    perform public.post_cheer('did_it', 'eleven');
    raise exception 'FAIL: Spec §5 Cheers: a few posts a day at most (10 in 24 hours)';
  exception when sqlstate 'P0429' then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.react_cheer(alice_post, 'got_this');
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.notifications where kind = 'cheer_reactions';
  if n <> 0 then raise exception 'FAIL: Spec §6 Cheers: no alert before 4 reactions'; end if;

  raise exception 'PASS: all Cheers checks passed (test data rolled back)';
end
$$;
