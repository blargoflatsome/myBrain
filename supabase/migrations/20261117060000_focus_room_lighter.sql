-- The focus room, lighter (docs/SPEC.md §5 Focus timer, 2026-11-17): at most 40 dots, each only a short anonymous id
-- and the seconds until that person's part ends, so a check-in stays small however many people are focusing. Old
-- check-ins are cleared only by the scheduled job, so check-ins arriving together don't wait on each other.
create or replace function public.focus_room(p_phase text default null, p_ends_at timestamptz default null)
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
  select count(*)::integer into joining from public.focus_presence f
  where f.user_id <> me and f.phase <> 'work' and f.checked_in_at > at - interval '3 minutes'
    and f.part_ends_at between wave - interval '1 minute' and wave + interval '1 minute';

  return jsonb_build_object('dots', dots, 'joining', joining, 'together', p_phase is not null and shown and jsonb_array_length(dots) > 0);
end;
$$;
revoke all on function public.focus_room(text, timestamptz) from public, anon;
grant execute on function public.focus_room(text, timestamptz) to authenticated;
