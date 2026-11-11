-- Checks for quest completions (SPEC §4, §5 Random Quest, §7, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  alice_quest constant uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  bob_quest   constant uuid := 'bbbbbbbb-2222-4222-8222-222222222222';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.quests (id, user_id, title) values (alice_quest, alice, 'Paint the fence'), (bob_quest, bob, 'Bob''s quest');
  insert into public.quest_logs (user_id, quest_id, date, completed_at) values (bob, bob_quest, '2026-11-09', now());

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'quest_logs';
  if n <> 1 then raise exception 'FAIL: Spec §7: quest completions sync live through Realtime'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.quest_logs where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user can read only their own quest completions'; end if;
  delete from public.quest_logs;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete quest completions (soft delete only)'; end if;

  -- Done twice: both completions are kept, and the quest itself stays.
  insert into public.quest_logs (quest_id, date, completed_at) values (alice_quest, '2026-11-08', now()), (alice_quest, '2026-11-09', now());
  select count(*) into n from public.quest_logs where quest_id = alice_quest;
  if n <> 2 then raise exception 'FAIL: Spec §5: a quest can be done more than once, each time logged'; end if;
  begin
    insert into public.quest_logs (quest_id, date, completed_at) values (bob_quest, '2026-11-09', now());
    raise exception 'FAIL: Spec §8: a completion can only be logged against my own quest';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.quest_logs (user_id, quest_id, date, completed_at) values (bob, bob_quest, '2026-11-09', now());
    raise exception 'FAIL: Spec §8: a user cannot log completions for someone else';
  exception when insufficient_privilege then null;
  end;

  -- Delete my data: the quests part removes my quests and their completions.
  perform public.delete_my_data(array['quests']);
  execute 'reset role';
  select count(*) into n from public.quest_logs where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: Delete my data removes my quest completions with my quests'; end if;
  select count(*) into n from public.quest_logs where user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §8: Delete my data never touches other people''s quest completions'; end if;

  raise exception 'PASS: all quest completion checks passed (test data rolled back)';
end
$$;
