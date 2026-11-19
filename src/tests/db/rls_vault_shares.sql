-- Checks for Shared Vaults: sharing with connections, what members can and can't do, names, leaving, and ending
-- access (SPEC §5 The Vault, Shared Vaults; §8). Always rolls back. Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  dave  constant uuid := '44444444-4444-4444-4444-444444444444';
  groceries uuid;
  private_b uuid;
  milk uuid;
  eggs constant uuid := '55555555-5555-5555-5555-555555555555';
  n int;
  r record;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{"full_name": "Alice Able"}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{"full_name": "Bob Baker"}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{"full_name": "Carol Cole"}', 'authenticated', 'authenticated'),
    (dave,  'dave@test.invalid',  '{"full_name": "Dave Day"}', 'authenticated', 'authenticated');
  -- Alice is connected to Bob and Carol; Bob and Carol aren't connected; Dave is nobody's connection.
  insert into public.connections (user_id, friend_id) values (alice, bob), (bob, alice), (alice, carol), (carol, alice);
  insert into public.vault_buckets (user_id, name, position) values (alice, 'Groceries', 9) returning id into groceries;
  insert into public.vault_buckets (user_id, name, position) values (alice, 'Private', 10) returning id into private_b;
  insert into public.vault_items (user_id, bucket_id, title, added_by) values (alice, groceries, 'Milk', alice) returning id into milk;
  insert into public.vault_items (user_id, bucket_id, title, added_by) values (alice, private_b, 'Secret', alice);

  execute 'set local role authenticated';

  -- Only the owner shares, and only with a connection.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  begin
    perform public.share_vault_bucket(groceries, carol);
    raise exception 'FAIL: Spec §5 Shared Vaults: only the owner shares a bucket';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  begin
    perform public.share_vault_bucket(groceries, dave);
    raise exception 'FAIL: Spec §5 Shared Vaults: a bucket is shared only with connections';
  exception when insufficient_privilege then null;
  end;
  perform public.share_vault_bucket(groceries, bob);
  perform public.share_vault_bucket(groceries, carol);
  perform public.share_vault_bucket(groceries, bob);
  select count(*) into n from public.vault_shares where bucket_id = groceries and deleted_at is null;
  if n <> 2 then raise exception 'FAIL: Spec §5 Shared Vaults: sharing twice with the same person shares once (got %)', n; end if;

  -- Bob sees the shared bucket and its items straight away, with a quiet alert; never Alice's other buckets.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.vault_buckets where user_id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: a member sees only the shared bucket (got %)', n; end if;
  select count(*) into n from public.vault_items where user_id = alice;
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: a member sees only the shared bucket''s items (got %)', n; end if;
  select count(*) into n from public.notifications where user_id = bob and kind = 'vault_shared' and item_id = groceries;
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: the person shared with gets an alert'; end if;

  -- Bob adds an item (sent with his own user_id, as the device does): it belongs to Alice's bucket, added by Bob.
  insert into public.vault_items (id, user_id, bucket_id, title) values (eggs, bob, groceries, 'Eggs');
  select * into r from public.vault_items where id = eggs;
  if r.user_id <> alice or r.added_by <> bob then raise exception 'FAIL: Spec §5 Shared Vaults: an item a member adds is the owner''s, added by the member'; end if;
  -- He edits and checks off Alice's item (an upsert, as the device sends it); who added it never changes.
  insert into public.vault_items (id, user_id, bucket_id, title, checked, added_by) values (milk, bob, groceries, 'Oat milk', true, bob)
  on conflict (id) do update set title = excluded.title, checked = excluded.checked, added_by = excluded.added_by;
  select * into r from public.vault_items where id = milk;
  if r.title <> 'Oat milk' or not r.checked or r.added_by <> alice then raise exception 'FAIL: Spec §5 Shared Vaults: a member edits items, and who added one never changes'; end if;
  -- He can't rename the bucket, add to Alice's private bucket, or share it on.
  update public.vault_buckets set name = 'Mine now' where id = groceries;
  begin
    insert into public.vault_items (user_id, bucket_id, title) values (bob, private_b, 'Sneaky');
    raise exception 'FAIL: Spec §8: nobody adds to a bucket that isn''t shared with them';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  execute 'reset role';
  select count(*) into n from public.vault_buckets where id = groceries and name = 'Groceries';
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: only the owner renames a bucket'; end if;
  execute 'set local role authenticated';

  -- Names: Alice (a connection) by name; Carol (not Bob's connection) without one.
  select count(*) into n from public.vault_people() where bucket_id = groceries and person = alice and is_owner and display_name = 'Alice Able';
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: a member sees who shared it'; end if;
  select count(*) into n from public.vault_people() where bucket_id = groceries and person = carol and display_name is null;
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: names of people who aren''t my connections stay hidden'; end if;

  -- My star on a shared bucket is mine alone.
  insert into public.vault_stars (bucket_id) values (groceries);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.vault_stars;
  if n <> 0 then raise exception 'FAIL: Spec §5 Shared Vaults: stars are per person'; end if;

  -- Bob leaves: the bucket goes from his view; his item stays in Alice's list.
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.leave_vault_bucket(groceries);
  select count(*) into n from public.vault_buckets where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Shared Vaults: leaving removes the bucket from my Vault'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.vault_items where id = eggs;
  if n <> 1 then raise exception 'FAIL: Spec §5 Shared Vaults: items I added stay after I leave'; end if;

  -- Removing the connection ends sharing both ways.
  perform public.remove_connection(carol);
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  select count(*) into n from public.vault_buckets where user_id = alice;
  if n <> 0 then raise exception 'FAIL: Spec §5 Shared Vaults: removing a connection ends sharing'; end if;

  -- Delete my data (Vault): items I added to others' buckets stay, no longer marked as mine.
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.share_vault_bucket(groceries, bob);
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform public.delete_my_data(array['vault']);
  execute 'reset role';
  select * into r from public.vault_items where id = eggs;
  if r.id is null or r.added_by is not null then raise exception 'FAIL: Spec §5 Shared Vaults: Delete my data leaves my adds in others'' lists, unmarked'; end if;
  execute 'set local role authenticated';

  -- Signed out: nothing.
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.vault_shares;
    raise exception 'FAIL: Spec §8: signed-out visitors can''t read shares';
  exception when insufficient_privilege then null;
  end;

  raise exception 'PASS: all Shared Vaults checks passed (test data rolled back)';
end
$$;
