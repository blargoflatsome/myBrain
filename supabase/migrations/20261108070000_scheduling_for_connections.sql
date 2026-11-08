-- Connections, part 5 (docs/SPEC.md §10 Connections): scheduling comes back for connections only. Someone's free or
-- busy times (never what their plans are) are shared only with people they're connected with, and only if they
-- share their availability.
create or replace function public.free_busy(people uuid[])
returns table (user_id uuid, timezone text, kind text, weekday smallint, start_date date, start_time time,
               end_date date, end_time time, repeat text, busy boolean)
language sql stable security definer set search_path = '' as $$
  with allowed as (
    select p.user_id, p.timezone from public.profiles p
    where p.user_id = any (people) and p.share_availability and p.deleted_at is null
      and (p.user_id = auth.uid() or public.are_connected(auth.uid(), p.user_id))
  )
  select a.user_id, a.timezone, 'rule', ar.weekday, null::date, ar.start_time, null::date, ar.end_time, null::text, true
  from allowed a join public.availability_rules ar on ar.user_id = a.user_id and ar.deleted_at is null
  union all
  select a.user_id, a.timezone, 'exception', null, x.date, x.start_time, x.date, x.end_time, null, x.kind = 'unavailable'
  from allowed a join public.availability_exceptions x on x.user_id = a.user_id and x.deleted_at is null and x.date >= current_date - 1
  union all
  select a.user_id, a.timezone, 'event', null, e.start_date, e.start_time, e.end_date, e.end_time, e.repeat, true
  from allowed a join public.events e on e.user_id = a.user_id and e.deleted_at is null and e.cancelled_at is null
  union all
  select a.user_id, a.timezone, 'event', null, e.start_date, e.start_time, e.end_date, e.end_time, e.repeat, true
  from allowed a
  join public.invite_recipients r on r.user_id = a.user_id
  join public.event_invites i on i.id = r.invite_id and i.deleted_at is null and i.response in ('yes', 'maybe')
  join public.events e on e.id = i.event_id and e.deleted_at is null and e.cancelled_at is null;
$$;
