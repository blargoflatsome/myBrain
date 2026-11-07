-- Checks for Post Its (SPEC §4, §5, §7, §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated');
  insert into public.post_its (user_id, body) values (bob, '<p>bob note</p>');

  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'post_its';
  if n <> 1 then raise exception 'FAIL: Spec §7: Post Its sync live through Realtime'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.post_its where user_id <> alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user can read only their own Post Its'; end if;
  update public.post_its set deleted_at = now() where user_id = bob;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §8: a user cannot change someone else''s Post Its'; end if;
  delete from public.post_its;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Spec §7: clients cannot hard-delete Post Its (soft delete only)'; end if;

  insert into public.post_its (body) values ('<p>buy stamps</p>');
  select count(*) into n from public.post_its where user_id = alice and color = 'yellow';
  if n <> 1 then raise exception 'FAIL: Spec §5: a Post It belongs to its writer and is yellow by default'; end if;
  begin
    insert into public.post_its (body, color) values ('<p>x</p>', 'purple');
    raise exception 'FAIL: Spec §5: Post Its are yellow, pink, blue or green';
  exception when check_violation then null;
  end;
  begin
    insert into public.post_its (user_id, body) values (bob, '<p>planted</p>');
    raise exception 'FAIL: Spec §8: a user cannot create Post Its for someone else';
  exception when insufficient_privilege then null;
  end;

  -- Delete my data: the Post Its part removes only my Post Its.
  perform public.delete_my_data(array['post_its']);
  execute 'reset role';
  select count(*) into n from public.post_its where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §8: Delete my data removes my Post Its when ticked'; end if;
  select count(*) into n from public.post_its where user_id = bob;
  if n <> 1 then raise exception 'FAIL: Spec §8: Delete my data never touches other people''s Post Its'; end if;

  raise exception 'PASS: all Post It checks passed (test data rolled back)';
end
$$;
