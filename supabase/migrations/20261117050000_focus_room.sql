-- The focus room (docs/SPEC.md §5 Focus timer, §4 focus_presence, §5 Trophies Focused together): while my Focus timer
-- runs it checks in once a minute; everyone sees only anonymous dots for the others there, and how many are joining
-- the next wave. Never names, never a count of the room.

-- 1. Show me in the focus room (on by default).
alter table public.profiles add column focus_room boolean not null default true;

-- 2. One row per person while their timer runs. No write policies: only the functions below change it.
create table public.focus_presence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  -- wait = waiting to start with a wave; then work, short or long, like the timer.
  phase text not null check (phase in ('wait', 'work', 'short', 'long')),
  part_ends_at timestamptz not null,
  checked_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger focus_presence_set_updated_at before insert or update on public.focus_presence
  for each row execute function public.set_updated_at();
alter table public.focus_presence enable row level security;
create policy "focus_presence: owner can read" on public.focus_presence for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.focus_presence from anon;
revoke insert, update, delete on public.focus_presence from authenticated;
create index focus_presence_checked_in_idx on public.focus_presence (checked_in_at);

-- 3. Check in (or, with no phase, just look) and see the room: a dot for each other person focusing now (an id that
-- changes every session, their part and when it ends, so the dot can glow then), how many others will start with
-- the next :00 or :30 wave, and whether this check-in counts for Focused together (I'm shown and someone else is
-- there). Check-ins older than 3 minutes are ignored, and cleared after 10.
create function public.focus_room(p_phase text default null, p_ends_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  wave constant timestamptz := to_timestamp((floor(extract(epoch from at) / 1800) + 1) * 1800);
  shown boolean;
  dots jsonb;
  joining integer;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_phase is not null then
    if p_phase not in ('wait', 'work', 'short', 'long') then raise exception 'Unknown part' using errcode = '22023'; end if;
    if p_ends_at is null or p_ends_at < at - interval '5 minutes' or p_ends_at > at + interval '1 hour' then
      raise exception 'Part end out of range' using errcode = '22023';
    end if;
  end if;
  select coalesce((select p.focus_room from public.profiles p where p.user_id = me), true) into shown;

  delete from public.focus_presence where checked_in_at < at - interval '10 minutes';
  if p_phase is not null and shown then
    insert into public.focus_presence (user_id, phase, part_ends_at, checked_in_at) values (me, p_phase, p_ends_at, at)
    on conflict (user_id) do update set phase = excluded.phase, part_ends_at = excluded.part_ends_at, checked_in_at = at;
  elsif p_phase is not null then
    delete from public.focus_presence where user_id = me;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'phase', d.phase, 'ends_at', d.part_ends_at)), '[]'::jsonb) into dots
  from (select f.id, f.phase, f.part_ends_at from public.focus_presence f
        where f.user_id <> me and f.phase <> 'wait' and f.checked_in_at > at - interval '3 minutes'
        order by f.created_at limit 200) d;
  select count(*)::integer into joining from public.focus_presence f
  where f.user_id <> me and f.phase <> 'work' and f.checked_in_at > at - interval '3 minutes'
    and f.part_ends_at between wave - interval '1 minute' and wave + interval '1 minute';

  return jsonb_build_object('dots', dots, 'joining', joining, 'together', p_phase is not null and shown and jsonb_array_length(dots) > 0);
end;
$$;
revoke all on function public.focus_room(text, timestamptz) from public, anon;
grant execute on function public.focus_room(text, timestamptz) to authenticated;

-- 4. Leave the room when the timer stops (the next session gets a new dot).
create function public.focus_leave()
returns void language sql security definer set search_path = '' as $$
  delete from public.focus_presence where user_id = auth.uid();
$$;
revoke all on function public.focus_leave() from public, anon;
grant execute on function public.focus_leave() to authenticated;

-- 5. Clear old check-ins even when nobody checks in.
create function public.expire_focus_presence()
returns void language sql security definer set search_path = '' as $$
  delete from public.focus_presence where checked_in_at < now() - interval '10 minutes';
$$;
revoke all on function public.expire_focus_presence() from public, anon, authenticated;
select cron.schedule('my-brain-expire-focus-presence', '*/10 * * * *', 'select public.expire_focus_presence()');
