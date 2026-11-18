-- Cheers (docs/SPEC.md §5 Cheers, §4, §6): an anonymous 48-hour feed of "I did it!", "I'm stuck" and "I got unstuck!"
-- posts from everyone, with four encouraging reactions. Everything goes through server functions, which never return
-- who wrote a post or who reacted. Also: finished Breathes are recorded in activity_log (§5 Trophies).

-- 1. Breathe in the activity log. The old check is replaced; NOT VALID so old rows can't block the change.
alter table public.activity_log drop constraint activity_log_kind;
alter table public.activity_log add constraint activity_log_kind
  check (kind in ('focus', 'capture', 'orphans_cleared', 'breathe')) not valid;

-- 2. Tables. RLS is on with no policies for writing: only the functions below change them.
create table public.cheer_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('did_it', 'stuck', 'unstuck')),
  body text not null default '' check (length(body) <= 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cheer_posts_stuck_has_no_text check (kind <> 'stuck' or body = '')
);
create trigger cheer_posts_set_updated_at before insert or update on public.cheer_posts
  for each row execute function public.set_updated_at();
alter table public.cheer_posts enable row level security;
create policy "cheer_posts: owner can read" on public.cheer_posts for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.cheer_posts from anon;
create index cheer_posts_created_idx on public.cheer_posts (created_at desc) where deleted_at is null;
create index cheer_posts_user_created_idx on public.cheer_posts (user_id, created_at desc);

create table public.cheer_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.cheer_posts (id) on delete cascade,
  reaction text not null check (reaction in ('got_this', 'proud', 'strength', 'celebrate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- One per person per post, final once picked.
  constraint cheer_reactions_one_each unique (post_id, user_id)
);
create trigger cheer_reactions_set_updated_at before insert or update on public.cheer_reactions
  for each row execute function public.set_updated_at();
alter table public.cheer_reactions enable row level security;
create policy "cheer_reactions: owner can read" on public.cheer_reactions for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.cheer_reactions from anon;
create index cheer_reactions_user_idx on public.cheer_reactions (user_id);

-- Whose posts I've hidden. No read policy at all: I must never learn who it is.
create table public.cheer_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cheer_blocks_once unique (user_id, blocked_user)
);
create trigger cheer_blocks_set_updated_at before insert or update on public.cheer_blocks
  for each row execute function public.set_updated_at();
alter table public.cheer_blocks enable row level security;
revoke all on public.cheer_blocks from anon, authenticated;
create index cheer_blocks_blocked_idx on public.cheer_blocks (blocked_user);

-- My totals for the Cheering others on trophies, kept as I react so they outlast the posts. Never says which posts.
create table public.cheer_tally (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  given integer not null default 0,
  days integer not null default 0,
  last_day date,
  firsts integer not null default 0,
  unstuck integer not null default 0,
  while_stuck boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger cheer_tally_set_updated_at before insert or update on public.cheer_tally
  for each row execute function public.set_updated_at();
alter table public.cheer_tally enable row level security;
create policy "cheer_tally: owner can read" on public.cheer_tally for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.cheer_tally from anon;

-- 3. Helpers (not callable from the app).
-- When "today" began for someone, in their own time zone.
create function public.cheer_day_start(p_user uuid, at timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select ((at at time zone tz)::date)::timestamp at time zone tz
  from (select coalesce((select p.timezone from public.profiles p where p.user_id = p_user), 'UTC') as tz) z;
$$;
create function public.cheer_local_day(p_user uuid, at timestamptz)
returns date language sql stable set search_path = '' as $$
  select (at at time zone coalesce((select p.timezone from public.profiles p where p.user_id = p_user), 'UTC'))::date;
$$;
revoke all on function public.cheer_day_start(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.cheer_local_day(uuid, timestamptz) from public, anon, authenticated;

-- My stuck post today with no "I got unstuck!" after it, if any.
create function public.cheer_open_stuck(p_user uuid, at timestamptz)
returns uuid language sql stable set search_path = '' as $$
  select s.id from public.cheer_posts s
  where s.user_id = p_user and s.kind = 'stuck' and s.deleted_at is null
    and s.created_at >= public.cheer_day_start(p_user, at)
    and not exists (select 1 from public.cheer_posts u where u.user_id = p_user and u.kind = 'unstuck'
                    and u.deleted_at is null and u.created_at > s.created_at)
  order by s.created_at desc limit 1;
$$;
revoke all on function public.cheer_open_stuck(uuid, timestamptz) from public, anon, authenticated;

-- 4. The feed: the last 48 hours, newest first, without anyone I've hidden. Never the author. Counts only on my own.
create function public.cheer_feed()
returns table (id uuid, kind text, body text, created_at timestamptz, mine boolean, my_reaction text,
               got_this integer, proud integer, strength integer, celebrate integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.body, p.created_at, p.user_id = auth.uid(),
    (select r.reaction from public.cheer_reactions r where r.post_id = p.id and r.user_id = auth.uid()),
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'got_this') end,
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'proud') end,
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'strength') end,
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'celebrate') end
  from public.cheer_posts p
  where auth.uid() is not null and p.deleted_at is null and p.created_at > now() - interval '48 hours'
    and not exists (select 1 from public.cheer_blocks b where b.user_id = auth.uid() and b.blocked_user = p.user_id)
  order by p.created_at desc
  limit 200;
$$;
revoke all on function public.cheer_feed() from public, anon;
grant execute on function public.cheer_feed() to authenticated;

-- 5. Posting. At most 5 posts in any 24 hours, so the feed can't be flooded. "I got unstuck!" needs a stuck post
-- today, and tells everyone who reacted to it (and counts for their Got someone unstuck trophy).
create function public.post_cheer(p_kind text, p_body text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  txt text := btrim(coalesce(p_body, ''));
  stuck uuid;
  new_id uuid;
  r record;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_kind not in ('did_it', 'stuck', 'unstuck') then raise exception 'Unknown kind' using errcode = '22023'; end if;
  if p_kind = 'stuck' then txt := ''; end if;
  if length(txt) > 140 then raise exception 'Too long' using errcode = '22001'; end if;
  if p_kind = 'did_it' and txt = '' then raise exception 'Say what you did' using errcode = '22023'; end if;
  if (select count(*) from public.cheer_posts c where c.user_id = me and c.created_at > at - interval '24 hours') >= 5 then
    raise exception 'Post limit reached' using errcode = 'P0429';
  end if;
  if p_kind = 'unstuck' then
    stuck := public.cheer_open_stuck(me, at);
    if stuck is null then raise exception 'Not stuck today' using errcode = '22023'; end if;
  end if;
  insert into public.cheer_posts (user_id, kind, body) values (me, p_kind, txt) returning id into new_id;
  if stuck is not null then
    for r in select x.user_id from public.cheer_reactions x where x.post_id = stuck loop
      perform public.record_notification(r.user_id, 'cheer_unstuck', stuck, 'Someone you cheered on got unstuck!', '', '/cheers', at);
      insert into public.cheer_tally (user_id, unstuck) values (r.user_id, 1)
      on conflict (user_id) do update set unstuck = public.cheer_tally.unstuck + 1;
    end loop;
  end if;
  return new_id;
end;
$$;
revoke all on function public.post_cheer(text, text) from public, anon;
grant execute on function public.post_cheer(text, text) to authenticated;

-- How many others posted I'm stuck today (in my time zone), leaving me out.
create function public.cheer_stuck_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct p.user_id)::integer from public.cheer_posts p
  where auth.uid() is not null and p.kind = 'stuck' and p.deleted_at is null and p.user_id <> auth.uid()
    and p.created_at >= public.cheer_day_start(auth.uid(), now());
$$;
revoke all on function public.cheer_stuck_count() from public, anon;
grant execute on function public.cheer_stuck_count() to authenticated;

-- Whether I posted I'm stuck today and haven't posted I got unstuck! since (so the app can offer it).
create function public.cheer_am_stuck()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.cheer_open_stuck(auth.uid(), now()) is not null;
$$;
revoke all on function public.cheer_am_stuck() from public, anon;
grant execute on function public.cheer_am_stuck() to authenticated;

-- 6. Reacting: one per post, final, never on my own, only on posts still in the feed and not from someone I hid.
-- Keeps my tally, and tells the poster once, at 4 reactions.
create function public.react_cheer(post uuid, p_reaction text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  p public.cheer_posts;
  today date;
  first boolean;
  n integer;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_reaction not in ('got_this', 'proud', 'strength', 'celebrate') then raise exception 'Unknown reaction' using errcode = '22023'; end if;
  select * into p from public.cheer_posts c where c.id = post and c.deleted_at is null and c.created_at > at - interval '48 hours';
  if p.id is null or p.user_id = me
     or exists (select 1 from public.cheer_blocks b where b.user_id = me and b.blocked_user = p.user_id) then
    raise exception 'Not available' using errcode = '42501';
  end if;
  first := not exists (select 1 from public.cheer_reactions r where r.post_id = post);
  insert into public.cheer_reactions (user_id, post_id, reaction) values (me, post, p_reaction)
  on conflict (post_id, user_id) do nothing;
  if not found then return false; end if;

  today := public.cheer_local_day(me, at);
  insert into public.cheer_tally (user_id, given, days, last_day, firsts, while_stuck)
  values (me, 1, 1, today, case when first then 1 else 0 end,
          exists (select 1 from public.cheer_posts s where s.user_id = me and s.kind = 'stuck' and s.deleted_at is null
                  and s.created_at >= public.cheer_day_start(me, at)))
  on conflict (user_id) do update set
    given = public.cheer_tally.given + 1,
    days = public.cheer_tally.days + case when public.cheer_tally.last_day is distinct from today then 1 else 0 end,
    last_day = today,
    firsts = public.cheer_tally.firsts + case when first then 1 else 0 end,
    while_stuck = public.cheer_tally.while_stuck or excluded.while_stuck;

  select count(*) into n from public.cheer_reactions r where r.post_id = post;
  if n = 4 then
    perform public.record_notification(p.user_id, 'cheer_reactions', post, 'People cheered you on', '', '/cheers', at);
  end if;
  return true;
end;
$$;
revoke all on function public.react_cheer(uuid, text) from public, anon;
grant execute on function public.react_cheer(uuid, text) to authenticated;

-- 7. Hide posts from this person, from one of their posts. They're never told, and I never learn who it is.
create function public.block_cheer_author(post uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  author uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select c.user_id into author from public.cheer_posts c where c.id = post;
  if author is null or author = me then return; end if;
  insert into public.cheer_blocks (user_id, blocked_user) values (me, author) on conflict (user_id, blocked_user) do nothing;
end;
$$;
revoke all on function public.block_cheer_author(uuid) from public, anon;
grant execute on function public.block_cheer_author(uuid) to authenticated;

-- 8. Trophy counts gain my Cheers tally (SPEC §5 Trophies, Cheering others on).
drop function public.trophy_counts();
create function public.trophy_counts()
returns table (connections integer, blocks integer, cheers_given integer, cheer_days integer, cheer_firsts integer,
               cheer_unstuck integer, cheer_while_stuck boolean)
language sql stable security definer set search_path = '' as $$
  select
    (select count(distinct case when c.user_id = auth.uid() then c.friend_id else c.user_id end)::integer
       from public.connections c where auth.uid() in (c.user_id, c.friend_id)),
    (select count(*)::integer from public.connection_blocks b where b.user_id = auth.uid()),
    coalesce(t.given, 0), coalesce(t.days, 0), coalesce(t.firsts, 0), coalesce(t.unstuck, 0), coalesce(t.while_stuck, false)
  from (select 1) one left join public.cheer_tally t on t.user_id = auth.uid();
$$;
revoke all on function public.trophy_counts() from public, anon;
grant execute on function public.trophy_counts() to authenticated;

-- 9. Cheers alerts reach my phone like connection alerts (quiet hours apply).
drop index public.notifications_to_push_idx;
create index notifications_to_push_idx on public.notifications (created_at)
  where pushed_at is null and deleted_at is null
    and kind in ('connection_request', 'connection_accepted', 'cheer_reactions', 'cheer_unstuck');

create or replace function public.send_connection_pushes(at timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n record;
  p public.profiles;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
  app_url constant text := 'https://myadhdbrain.netlify.app';
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';
  for n in
    select * from public.notifications x
    where x.pushed_at is null and x.deleted_at is null
      and x.kind in ('connection_request', 'connection_accepted', 'cheer_reactions', 'cheer_unstuck')
    order by x.created_at limit 200
  loop
    select * into p from public.profiles where user_id = n.user_id;
    if n.read_at is not null or n.created_at < at - interval '1 day' or p.user_id is null then
      update public.notifications set pushed_at = at where id = n.id;
      continue;
    end if;
    if public.in_quiet_hours(p, at) then continue; end if;
    if p.notify_web_push and fn_url is not null and fn_secret is not null then
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
      from public.push_subscriptions s where s.user_id = n.user_id and s.deleted_at is null;
      if subs is not null then
        select net.http_post(
          url := fn_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
          body := jsonb_build_object('subscriptions', subs, 'payload', jsonb_build_object(
            'title', n.title, 'body', n.body, 'url', n.url, 'tag', n.kind || ':' || coalesce(n.item_id::text, n.id::text),
            'priority', false))
        ) into req;
      end if;
    end if;
    if p.notify_ntfy and p.ntfy_topic is not null and length(p.ntfy_topic) >= 16 then
      select net.http_post(url := 'https://ntfy.sh', body := jsonb_build_object(
        'topic', p.ntfy_topic, 'title', n.title, 'message', n.body, 'priority', 3, 'click', app_url || n.url)) into req;
    end if;
    update public.notifications set pushed_at = at where id = n.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function public.send_connection_pushes(timestamptz) from public, anon, authenticated;

-- 10. Posts leave the feed after 48 hours; they're removed a day later (reactions go with them; tallies stay).
create function public.expire_cheers()
returns void language sql security definer set search_path = '' as $$
  delete from public.cheer_posts where created_at < now() - interval '72 hours';
$$;
revoke all on function public.expire_cheers() from public, anon, authenticated;
select cron.schedule('my-brain-expire-cheers', '15 * * * *', 'select public.expire_cheers()');

-- 11. Delete my data gains a Cheers part: my posts, the cheers I gave and who I hid. My tally stays, like trophies.
create or replace function public.delete_my_data(parts text[] default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  everything constant text[] := array['tasks', 'inbox', 'quests', 'vault', 'journal', 'habits', 'routines', 'priority_tasks', 'tags', 'events', 'post_its', 'people', 'connections', 'cheers'];
  chosen text[] := coalesce(parts, everything);
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if cardinality(chosen) = 0 or not chosen <@ everything then
    raise exception 'Choose what to delete' using errcode = '22023';
  end if;

  if 'tasks' = any (chosen) then
    delete from public.item_tags where user_id = me and item_type = 'task';
    delete from public.tasks where user_id = me;
  end if;
  if 'inbox' = any (chosen) then
    delete from public.inbox where user_id = me;
  end if;
  if 'quests' = any (chosen) then
    delete from public.item_tags where user_id = me and item_type = 'quest';
    delete from public.quests where user_id = me;
  end if;
  if 'vault' = any (chosen) then
    delete from public.item_tags where user_id = me and item_type = 'vault_item';
    delete from public.vault_items where user_id = me;
    delete from public.vault_buckets where user_id = me;
    perform public.create_starter_buckets(me);
  end if;
  if 'journal' = any (chosen) then
    delete from public.item_tags where user_id = me and item_type = 'journal_entry';
    delete from public.journal_entries where user_id = me;
    delete from public.journal_passkeys where user_id = me;
    delete from public.journal_keys where user_id = me;
  end if;
  if 'habits' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'habit';
    delete from public.item_tags where user_id = me and item_type = 'habit';
    delete from public.habits where user_id = me;
    delete from public.habit_pauses where user_id = me;
  end if;
  if 'routines' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'routine';
    delete from public.item_tags where user_id = me and item_type = 'routine';
    delete from public.routines where user_id = me;
  end if;
  if 'priority_tasks' = any (chosen) then
    delete from public.reminder_state where user_id = me and kind = 'priority_task';
    delete from public.priority_tasks where user_id = me;
  end if;
  if 'events' = any (chosen) then
    delete from public.item_tags t using public.events e
    where t.user_id = me and t.item_type = 'event' and t.item_id = e.id and e.user_id = me
      and not exists (select 1 from public.event_invites i where i.event_id = e.id and i.deleted_at is null);
    delete from public.reminder_state s using public.events e
    where s.user_id = me and s.kind = 'event' and s.item_id = e.id and e.user_id = me
      and not exists (select 1 from public.event_invites i where i.event_id = e.id and i.deleted_at is null);
    delete from public.events e
    where e.user_id = me
      and not exists (select 1 from public.event_invites i where i.event_id = e.id and i.deleted_at is null);
  end if;
  if 'tags' = any (chosen) then
    delete from public.tags where user_id = me;
  end if;
  if 'post_its' = any (chosen) then
    delete from public.post_its where user_id = me;
  end if;
  if 'people' = any (chosen) then
    delete from public.people where user_id = me;
  end if;
  if 'connections' = any (chosen) then
    delete from public.connections where user_id = me or friend_id = me;
    delete from public.connection_requests where user_id = me or to_user = me;
  end if;
  if 'cheers' = any (chosen) then
    delete from public.cheer_posts where user_id = me;
    delete from public.cheer_reactions where user_id = me;
    delete from public.cheer_blocks where user_id = me;
  end if;

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;
