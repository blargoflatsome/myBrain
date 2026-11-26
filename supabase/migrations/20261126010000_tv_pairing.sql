-- TV pairing (docs/SPEC.md §9 Signing in by pairing). The TV shows a short code; I approve it on my phone; the TV then
-- gets its own device key and can only call the tv_* functions with it (it never gets a normal sign-in). The server keeps
-- only SHA-256 fingerprints of codes, pairing secrets and device keys.

-- A code waiting on a TV. Server-only: user_id is who approved it (null until then).
create table public.tv_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  code_hash text not null unique,
  secret_hash text not null unique,
  expires_at timestamptz not null default now() + interval '10 minutes',
  approved_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tv_pairings_expires_idx on public.tv_pairings (expires_at);
create index tv_pairings_user_idx on public.tv_pairings (user_id);
create trigger tv_pairings_set_updated_at before insert or update on public.tv_pairings
  for each row execute function public.set_updated_at();

-- A paired TV. Unpair soft-deletes it (Undo clears deleted_at).
create table public.paired_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'TV' check (char_length(name) <= 60),
  key_hash text not null unique,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index paired_devices_user_idx on public.paired_devices (user_id);
create trigger paired_devices_set_updated_at before insert or update on public.paired_devices
  for each row execute function public.set_updated_at();

-- Code tries, to stop guessing (10 a day per account).
create table public.tv_pair_tries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tv_pair_tries_user_idx on public.tv_pair_tries (user_id, created_at);

-- Only the functions below reach these tables.
alter table public.tv_pairings enable row level security;
alter table public.paired_devices enable row level security;
alter table public.tv_pair_tries enable row level security;
revoke all on public.tv_pairings, public.paired_devices, public.tv_pair_tries from anon, authenticated;

-- The TV asks for a code. Returns the code (shown) and a secret (kept on the TV) this once.
create function public.tv_pair_start()
returns table (code text, secret text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  c text;
  s text;
  made public.tv_pairings;
begin
  delete from public.tv_pairings p where p.expires_at < now() - interval '1 hour';
  -- Anyone can ask (the TV isn't signed in), so the number of codes waiting at once is capped.
  if (select count(*) from public.tv_pairings p where p.expires_at > now() and p.claimed_at is null) >= 1000 then
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
      insert into public.tv_pairings (code_hash, secret_hash) values (public.connect_hash(c), public.connect_hash(s))
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

-- I approve the code shown on my TV. True when it worked; false for a wrong or old code.
create function public.pair_tv(code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  found uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  delete from public.tv_pair_tries t where t.user_id = me and t.created_at < now() - interval '1 day';
  if (select count(*) from public.tv_pair_tries t where t.user_id = me) >= 10 then
    raise exception 'Too many TV code tries. Try again tomorrow.' using errcode = 'P0429';
  end if;
  insert into public.tv_pair_tries (user_id) values (me);
  update public.tv_pairings p set user_id = me, approved_at = now()
  where p.code_hash = public.connect_hash(regexp_replace(coalesce(code, ''), '\s', '', 'g'))
    and p.expires_at > now() and p.approved_at is null and p.deleted_at is null
  returning p.id into found;
  return found is not null;
end;
$$;
revoke all on function public.pair_tv(text) from public, anon;
grant execute on function public.pair_tv(text) to authenticated;

-- The TV checks on its code. 'waiting' until approved, then 'paired' with its device key (handed over this once),
-- or 'expired' (an old, unknown or already used code).
create function public.tv_pair_poll(secret text)
returns table (status text, device_key text)
language plpgsql security definer set search_path = '' as $$
declare
  p public.tv_pairings;
  k text;
begin
  select * into p from public.tv_pairings t
  where t.secret_hash = public.connect_hash(coalesce(secret, '')) and t.deleted_at is null and t.claimed_at is null
  for update;
  if p.id is null then
    status := 'expired';
  elsif p.approved_at is null then
    status := case when p.expires_at > now() then 'waiting' else 'expired' end;
  else
    k := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.paired_devices (user_id, key_hash, last_seen_at) values (p.user_id, public.connect_hash(k), now());
    update public.tv_pairings t set claimed_at = now() where t.id = p.id;
    status := 'paired';
    device_key := k;
  end if;
  return next;
end;
$$;
revoke all on function public.tv_pair_poll(text) from public;
grant execute on function public.tv_pair_poll(text) to anon, authenticated;

-- The account a device key belongs to, noting when the TV was last seen (at most once a minute). Every tv_* function
-- starts here; an unpaired or unknown key raises 28000, which the TV takes as "pair again".
create function public.tv_owner(device_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  d public.paired_devices;
begin
  select * into d from public.paired_devices pd
  where pd.key_hash = public.connect_hash(coalesce(device_key, '')) and pd.deleted_at is null;
  if d.id is null then raise exception 'This TV is not paired' using errcode = '28000'; end if;
  if d.last_seen_at is null or d.last_seen_at < now() - interval '1 minute' then
    update public.paired_devices pd set last_seen_at = now() where pd.id = d.id;
  end if;
  return d.user_id;
end;
$$;
revoke all on function public.tv_owner(text) from public, anon, authenticated;

-- The TV checks its key still works (on start and every 30 seconds while unpaired).
create function public.tv_check(device_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tv_owner(device_key);
  return true;
end;
$$;
revoke all on function public.tv_check(text) from public;
grant execute on function public.tv_check(text) to anon, authenticated;

-- Paired devices on the Account page.
create function public.my_paired_devices()
returns table (id uuid, name text, created_at timestamptz, last_seen_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.name, d.created_at, d.last_seen_at from public.paired_devices d
  where d.user_id = (select auth.uid()) and d.deleted_at is null
  order by d.created_at desc;
$$;
revoke all on function public.my_paired_devices() from public, anon;
grant execute on function public.my_paired_devices() to authenticated;

-- Unpair (and its Undo, which puts the same key back).
create function public.unpair_device(device uuid, undo boolean default false) returns void
language sql security definer set search_path = '' as $$
  update public.paired_devices d set deleted_at = case when undo then null else now() end
  where d.id = device and d.user_id = (select auth.uid());
$$;
revoke all on function public.unpair_device(uuid, boolean) from public, anon;
grant execute on function public.unpair_device(uuid, boolean) to authenticated;
