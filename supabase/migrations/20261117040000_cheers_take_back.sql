-- Cheers (docs/SPEC.md §5, 2026-11-17, user): tapping my reaction again takes it back, and I can pick again.
-- A taken-back reaction is kept as deleted (one row per person per post), so picking again never counts twice for
-- the Cheering others on trophies, or for First to cheer, and the poster's "People cheered you on" comes once.

-- 1. The feed counts and shows only reactions that haven't been taken back.
create or replace function public.cheer_feed()
returns table (id uuid, kind text, body text, created_at timestamptz, mine boolean, my_reaction text,
               got_this integer, proud integer, strength integer, celebrate integer)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.body, p.created_at, p.user_id = auth.uid(),
    (select r.reaction from public.cheer_reactions r where r.post_id = p.id and r.user_id = auth.uid() and r.deleted_at is null),
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'got_this' and r.deleted_at is null) end,
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'proud' and r.deleted_at is null) end,
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'strength' and r.deleted_at is null) end,
    case when p.user_id = auth.uid() then (select count(*)::integer from public.cheer_reactions r where r.post_id = p.id and r.reaction = 'celebrate' and r.deleted_at is null) end
  from public.cheer_posts p
  where auth.uid() is not null and p.deleted_at is null and p.created_at > now() - interval '48 hours'
    and not exists (select 1 from public.cheer_blocks b where b.user_id = auth.uid() and b.blocked_user = p.user_id)
  order by p.created_at desc
  limit 200;
$$;
revoke all on function public.cheer_feed() from public, anon;
grant execute on function public.cheer_feed() to authenticated;

-- 2. Reacting: one live reaction per person per post. Picking again after taking one back reuses the row and
-- isn't counted again. Returns false if I already have a live one (take it back first).
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
            exists (select 1 from public.cheer_posts s where s.user_id = me and s.kind = 'stuck' and s.deleted_at is null
                    and s.created_at >= public.cheer_day_start(me, at)))
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

-- 3. Taking my reaction back.
create function public.unreact_cheer(post uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  update public.cheer_reactions set deleted_at = now()
  where post_id = post and user_id = auth.uid() and deleted_at is null;
end;
$$;
revoke all on function public.unreact_cheer(uuid) from public, anon;
grant execute on function public.unreact_cheer(uuid) to authenticated;

-- 4. I got unstuck! tells only the people whose reaction is still there.
create or replace function public.post_cheer(p_kind text, p_body text default '')
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
  if (select count(*) from public.cheer_posts c where c.user_id = me and c.created_at > at - interval '24 hours') >= 10 then
    raise exception 'Post limit reached' using errcode = 'P0429';
  end if;
  if p_kind = 'unstuck' then
    stuck := public.cheer_open_stuck(me, at);
    if stuck is null then raise exception 'Not stuck today' using errcode = '22023'; end if;
  end if;
  insert into public.cheer_posts (user_id, kind, body) values (me, p_kind, txt) returning id into new_id;
  if stuck is not null then
    for r in select x.user_id from public.cheer_reactions x where x.post_id = stuck and x.deleted_at is null loop
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
