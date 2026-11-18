-- Cheers (docs/SPEC.md §5, 2026-11-18, user):
-- 1. Cheering while stuck counts only while I'm still stuck: not after I posted I got unstuck!
-- 2. Hiding someone keeps a copy of the post I hid them from, so I can find them again in Hidden people (I never
--    learn who it is), and Show again unhides them. Hiding returns the hide's id, for Undo.

-- 1. Reacting: the same as before, except "while stuck" uses the open stuck post (none once I'm unstuck).
create or replace function public.react_cheer(post uuid, p_reaction text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  p public.cheer_posts;
  old public.cheer_reactions;
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
  select * into old from public.cheer_reactions r where r.post_id = post and r.user_id = me;
  if old.id is not null then
    if old.deleted_at is null then return false; end if;
    update public.cheer_reactions set reaction = p_reaction, deleted_at = null where id = old.id;
  else
    first := not exists (select 1 from public.cheer_reactions r where r.post_id = post);
    insert into public.cheer_reactions (user_id, post_id, reaction) values (me, post, p_reaction)
    on conflict (post_id, user_id) do nothing;
    if not found then return false; end if;
    today := public.cheer_local_day(me, at);
    insert into public.cheer_tally (user_id, given, days, last_day, firsts, while_stuck)
    values (me, 1, 1, today, case when first then 1 else 0 end,
            public.cheer_open_stuck(me, at) is not null)
    on conflict (user_id) do update set
      given = public.cheer_tally.given + 1,
      days = public.cheer_tally.days + case when public.cheer_tally.last_day is distinct from today then 1 else 0 end,
      last_day = today,
      firsts = public.cheer_tally.firsts + case when first then 1 else 0 end,
      while_stuck = public.cheer_tally.while_stuck or excluded.while_stuck;
  end if;

  select count(*) into n from public.cheer_reactions r where r.post_id = post and r.deleted_at is null;
  if n >= 4 and not exists (select 1 from public.notifications x where x.user_id = p.user_id and x.kind = 'cheer_reactions' and x.item_id = post) then
    perform public.record_notification(p.user_id, 'cheer_reactions', post, 'People cheered you on', '', '/cheers', at);
  end if;
  return true;
end;
$$;
revoke all on function public.react_cheer(uuid, text) from public, anon;
grant execute on function public.react_cheer(uuid, text) to authenticated;


-- 2. The post I hid someone from. Hides made before this have none.
alter table public.cheer_blocks
  add column post_kind text check (post_kind in ('did_it', 'stuck', 'unstuck')),
  add column post_body text check (char_length(post_body) <= 140);

drop function public.block_cheer_author(uuid);
create function public.block_cheer_author(post uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  p public.cheer_posts;
  hide uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into p from public.cheer_posts c where c.id = post;
  if p.user_id is null or p.user_id = me then return null; end if;
  insert into public.cheer_blocks (user_id, blocked_user, post_kind, post_body) values (me, p.user_id, p.kind, p.body)
  on conflict (user_id, blocked_user) do nothing
  returning id into hide;
  return hide;
end;
$$;
revoke all on function public.block_cheer_author(uuid) from public, anon;
grant execute on function public.block_cheer_author(uuid) to authenticated;

-- Hidden people: mine, newest first, each by the post I hid them from. Never who it is.
create function public.cheer_hidden()
returns table (id uuid, post_kind text, post_body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.post_kind, b.post_body, b.created_at from public.cheer_blocks b
  where b.user_id = auth.uid()
  order by b.created_at desc;
$$;
revoke all on function public.cheer_hidden() from public, anon;
grant execute on function public.cheer_hidden() to authenticated;

-- Show again: only my own hides.
create function public.cheer_unhide(hide uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  delete from public.cheer_blocks where id = hide and user_id = auth.uid();
end;
$$;
revoke all on function public.cheer_unhide(uuid) from public, anon;
grant execute on function public.cheer_unhide(uuid) to authenticated;
