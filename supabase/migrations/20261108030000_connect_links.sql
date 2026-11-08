-- Connections, part 2 (docs/SPEC.md §10 Connections): a connect link and short code I share myself. Each works for
-- 24 hours and for one person; whoever uses it is connected with me straight away, since I chose to share it.
-- Only hashes of the link and code are stored, so they're shown to me once, when made.

create table public.connect_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique,
  code_hash text not null unique,
  expires_at timestamptz not null default now() + interval '24 hours',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index connect_links_user_idx on public.connect_links (user_id, expires_at);
create trigger connect_links_set_updated_at before insert or update on public.connect_links
  for each row execute function public.set_updated_at();

-- Code tries, to stop guessing (10 an hour per user).
create table public.connect_code_tries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index connect_code_tries_user_idx on public.connect_code_tries (user_id, created_at);

alter table public.connect_links enable row level security;
alter table public.connect_code_tries enable row level security;
revoke all on public.connect_links, public.connect_code_tries from anon, authenticated;

create function public.connect_hash(secret text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(upper(btrim(secret)), 'sha256'), 'hex');
$$;
revoke all on function public.connect_hash(text) from public, anon, authenticated;

-- Make a link and code (at most 5 working at once). The link token and code are returned this once.
create function public.create_connect_link()
returns table (id uuid, token text, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  t text := encode(extensions.gen_random_bytes(24), 'hex');
  c text := '';
  link public.connect_links;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if (select count(*) from public.connect_links l where l.user_id = me and l.used_at is null and l.cancelled_at is null
      and l.expires_at > now()) >= 5 then
    raise exception 'At most 5 links at a time' using errcode = '22023';
  end if;
  for i in 0..7 loop
    c := c || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  insert into public.connect_links (user_id, token_hash, code_hash) values (me, public.connect_hash(t), public.connect_hash(c))
  returning * into link;
  id := link.id;
  token := t;
  code := c;
  expires_at := link.expires_at;
  return next;
end;
$$;
revoke all on function public.create_connect_link() from public, anon;
grant execute on function public.create_connect_link() to authenticated;

create function public.my_connect_links()
returns table (id uuid, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.created_at, l.expires_at from public.connect_links l
  where l.user_id = auth.uid() and l.used_at is null and l.cancelled_at is null and l.expires_at > now()
  order by l.created_at desc;
$$;
revoke all on function public.my_connect_links() from public, anon;
grant execute on function public.my_connect_links() to authenticated;

create function public.cancel_connect_link(link uuid) returns void
language sql security definer set search_path = '' as $$
  update public.connect_links l set cancelled_at = now()
  where l.id = link and l.user_id = auth.uid() and l.used_at is null and l.cancelled_at is null;
$$;
revoke all on function public.cancel_connect_link(uuid) from public, anon;
grant execute on function public.cancel_connect_link(uuid) to authenticated;

-- The working link for a token or code, counting code tries.
create function public.find_connect_link(token text, code text) returns public.connect_links
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  link public.connect_links;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if coalesce(token, '') = '' then
    if (select count(*) from public.connect_code_tries t where t.user_id = me and t.created_at > now() - interval '1 hour') >= 10 then
      raise exception 'Too many tries. Try again in an hour.' using errcode = '22023';
    end if;
    insert into public.connect_code_tries (user_id) values (me);
  end if;
  select * into link from public.connect_links l
  where (case when coalesce(token, '') <> '' then l.token_hash = public.connect_hash(token) else l.code_hash = public.connect_hash(code) end)
    and l.used_at is null and l.cancelled_at is null and l.expires_at > now() and l.deleted_at is null
    and l.user_id <> me and not public.is_blocked(me, l.user_id);
  return link;
end;
$$;
revoke all on function public.find_connect_link(text, text) from public, anon, authenticated;

-- Who a link or code belongs to (name and picture), or nothing if it no longer works.
create function public.preview_connect_link(token text default null, code text default null)
returns table (display_name text, avatar_url text, already_connected boolean)
language plpgsql security definer set search_path = '' as $$
declare
  link public.connect_links := public.find_connect_link(token, code);
begin
  if link.id is null then return; end if;
  return query select coalesce(p.display_name, 'Someone'), p.avatar_url, public.are_connected(auth.uid(), link.user_id)
    from public.profiles p where p.user_id = link.user_id;
end;
$$;
revoke all on function public.preview_connect_link(text, text) from public, anon;
grant execute on function public.preview_connect_link(text, text) to authenticated;

-- Use a link or code: connects us straight away and uses it up. Returns their name, or nothing if it no longer works.
create function public.use_connect_link(token text default null, code text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  link public.connect_links := public.find_connect_link(token, code);
  owner_name text;
  my_name text;
begin
  if link.id is null then return null; end if;
  insert into public.connections (user_id, friend_id) values (me, link.user_id), (link.user_id, me)
  on conflict (user_id, friend_id) where deleted_at is null do nothing;
  update public.connect_links l set used_by = me, used_at = now() where l.id = link.id;
  select coalesce(p.display_name, 'Someone') into owner_name from public.profiles p where p.user_id = link.user_id;
  select coalesce(p.display_name, 'Someone') into my_name from public.profiles p where p.user_id = me;
  perform public.record_notification(link.user_id, 'connection_accepted', link.id, my_name || ' connected with you',
    'They used your connect link. You can now invite each other to events.', '/connections', now());
  return owner_name;
end;
$$;
revoke all on function public.use_connect_link(text, text) from public, anon;
grant execute on function public.use_connect_link(text, text) to authenticated;
