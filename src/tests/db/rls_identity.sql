-- Checks that people are matched only by what proves who they are (SPEC §8, §10 Connections). Always rolls back.
-- Run: npm run test:db
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  n int;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
    (alice, 'alice@test.invalid', '{}', 'authenticated', 'authenticated'),
    (bob,   'bob@test.invalid',   '{}', 'authenticated', 'authenticated'),
    (carol, 'carol@test.invalid', '{}', 'authenticated', 'authenticated');

  -- Bob tries to take Alice's address and claim a verified phone.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  update public.profiles set email = 'alice@test.invalid', phone = '5550107000', phone_verified = true where user_id = bob;
  select count(*) into n from public.profiles where user_id = bob and email = 'bob@test.invalid' and not phone_verified;
  if n <> 1 then raise exception 'FAIL: Spec §8: my account email and phone verification can''t be changed by me'; end if;

  -- Carol asks Alice's address: it reaches Alice, not Bob.
  perform set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true);
  perform public.request_connection('alice@test.invalid');
  -- An unverified phone number never finds an account.
  perform public.request_connection('(555) 010-7000');
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.incoming_connection_requests();
  if n <> 0 then raise exception 'FAIL: Spec §10: a request reaches only the account signed in with that email or a verified phone'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  select count(*) into n from public.incoming_connection_requests();
  if n <> 1 then raise exception 'FAIL: Spec §10: a request to my sign-in email reaches me'; end if;

  -- Once the server has verified it, a phone number does find the account.
  execute 'reset role';
  update public.profiles set phone_verified = true where user_id = bob;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);
  perform public.request_connection('555-010-7000');
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  select count(*) into n from public.incoming_connection_requests();
  if n <> 1 then raise exception 'FAIL: Spec §10: a verified phone number finds the account'; end if;

  raise exception 'PASS: all identity checks passed (test data rolled back)';
end
$$;
