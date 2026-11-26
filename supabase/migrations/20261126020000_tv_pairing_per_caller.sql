-- TV pairing (docs/SPEC.md §9): anyone may ask for a TV code, since the TV isn't signed in, so one caller mustn't be
-- able to use up every slot and block other TVs from pairing (code review 2026-11-26). Each caller (known by a
-- fingerprint of its address) may have 5 codes waiting; the overall cap stays as a backstop.

alter table public.tv_pairings add column requester text check (char_length(requester) <= 64);
create index tv_pairings_requester_idx on public.tv_pairings (requester, expires_at);

-- The caller's address as Supabase's edge saw it (Cloudflare's header, which a caller can't set), as a fingerprint.
create function public.tv_requester() returns text
language plpgsql stable set search_path = '' as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  ip text := coalesce(headers ->> 'cf-connecting-ip', btrim(split_part(headers ->> 'x-forwarded-for', ',', -1)));
begin
  if coalesce(ip, '') = '' then return null; end if;
  return encode(extensions.digest(ip, 'sha256'), 'hex');
end;
$$;
revoke all on function public.tv_requester() from public, anon, authenticated;

create or replace function public.tv_pair_start()
returns table (code text, secret text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  who constant text := public.tv_requester();
  bytes bytea;
  c text;
  s text;
  made public.tv_pairings;
begin
  delete from public.tv_pairings p where p.expires_at < now() - interval '1 hour';
  if who is not null and (select count(*) from public.tv_pairings p
      where p.requester = who and p.expires_at > now() and p.claimed_at is null) >= 5 then
    raise exception 'Too many TV codes waiting from here' using errcode = 'P0429';
  end if;
  if (select count(*) from public.tv_pairings p where p.expires_at > now() and p.claimed_at is null) >= 5000 then
    raise exception 'Too many TV codes waiting' using errcode = 'P0429';
  end if;
  for attempt in 1..5 loop
    bytes := extensions.gen_random_bytes(6);
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    s := encode(extensions.gen_random_bytes(32), 'hex');
    begin
      insert into public.tv_pairings (code_hash, secret_hash, requester)
      values (public.connect_hash(c), public.connect_hash(s), who)
      returning * into made;
      exit;
    exception when unique_violation then
      if attempt = 5 then raise; end if;
    end;
  end loop;
  code := c;
  secret := s;
  expires_at := made.expires_at;
  return next;
end;
$$;
revoke all on function public.tv_pair_start() from public;
grant execute on function public.tv_pair_start() to anon, authenticated;
