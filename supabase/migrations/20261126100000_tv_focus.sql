-- TV app step 5, the Focus timer (docs/SPEC.md §9): the TV joins the quiet room and keeps its finished sessions for
-- trophies (2026-11-26, user: they count). The room's rules move into focus_room_as, which the app's focus_room and
-- the TV's tv_focus_room both call, so they can't drift apart. tv_log_focus is the TV's one other write.

-- The room for one person: check in with my part (or only look, with no part), and see up to 40 others as dots.
create function public.focus_room_as(me uuid, p_phase text, p_ends_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  at constant timestamptz := now();
  shown boolean;
  dots jsonb;
begin
  if p_phase is not null then
    if p_phase not in ('work', 'short', 'long') then raise exception 'Unknown part' using errcode = '22023'; end if;
    if p_ends_at is null or p_ends_at < at - interval '5 minutes' or p_ends_at > at + interval '1 hour' then
      raise exception 'Part end out of range' using errcode = '22023';
    end if;
  end if;
  select coalesce((select p.focus_room from public.profiles p where p.user_id = me), true) into shown;

  if p_phase is not null and shown then
    insert into public.focus_presence (user_id, phase, part_ends_at, checked_in_at) values (me, p_phase, p_ends_at, at)
    on conflict (user_id) do update set phase = excluded.phase, part_ends_at = excluded.part_ends_at, checked_in_at = at;
  elsif p_phase is not null then
    delete from public.focus_presence where user_id = me;
  end if;

  -- Ordered by a hash of the row id, so the same 40 stay on screen from one check-in to the next.
  select coalesce(jsonb_agg(jsonb_build_object('id', d.short_id, 's', d.secs)), '[]'::jsonb) into dots
  from (select left(md5(f.id::text), 8) as short_id, round(extract(epoch from f.part_ends_at - at))::integer as secs
        from public.focus_presence f
        where f.user_id <> me and f.phase <> 'wait' and f.checked_in_at > at - interval '3 minutes'
        order by md5(f.id::text) limit 40) d;

  return jsonb_build_object('dots', dots, 'together', p_phase is not null and shown and jsonb_array_length(dots) > 0);
end;
$$;
-- Only the functions below call it, each with an owner it has checked.
revoke all on function public.focus_room_as(uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.focus_room(p_phase text default null, p_ends_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  return public.focus_room_as(me, p_phase, p_ends_at);
end;
$$;

-- The TV's check-in, with its device key (an unpaired key raises 28000).
create function public.tv_focus_room(device_key text, p_phase text default null, p_ends_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.focus_room_as(public.tv_owner(device_key), p_phase, p_ends_at);
end;
$$;
revoke all on function public.tv_focus_room(text, text, timestamptz) from public;
grant execute on function public.tv_focus_room(text, text, timestamptz) to anon, authenticated;

create function public.tv_focus_leave(device_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.focus_presence where user_id = public.tv_owner(device_key);
end;
$$;
revoke all on function public.tv_focus_leave(text) from public;
grant execute on function public.tv_focus_leave(text) to anon, authenticated;

-- A work part finished on the TV, kept like the app's (SPEC §5 Trophies): 25 minutes, and Focused together when
-- someone else was in the room. The id is made on the TV, so a retry never counts twice; it must have just ended.
create function public.tv_log_focus(device_key text, id uuid, at timestamptz, together boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
begin
  me := public.tv_owner(device_key);
  if id is null or at is null or at < now() - interval '1 day' or at > now() + interval '5 minutes' then
    raise exception 'TV focus not allowed' using errcode = '22023';
  end if;
  insert into public.activity_log (id, user_id, kind, at, detail)
  values (tv_log_focus.id, me, 'focus', tv_log_focus.at,
    case when together then '{"minutes": 25, "together": true}'::jsonb else '{"minutes": 25}'::jsonb end)
  on conflict on constraint activity_log_pkey do nothing;
end;
$$;
revoke all on function public.tv_log_focus(text, uuid, timestamptz, boolean) from public;
grant execute on function public.tv_log_focus(text, uuid, timestamptz, boolean) to anon, authenticated;
