-- TV app step 5 review (docs/SPEC.md §9 Focus timer): a finished session is stamped with the server's time, so a TV
-- whose clock runs fast or slow still has its sessions kept.

drop function public.tv_log_focus(text, uuid, timestamptz, boolean);

create function public.tv_log_focus(device_key text, id uuid, together boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
begin
  me := public.tv_owner(device_key);
  if id is null then
    raise exception 'TV focus not allowed' using errcode = '22023';
  end if;
  -- The id is made on the TV, so a retry never counts twice.
  insert into public.activity_log (id, user_id, kind, at, detail)
  values (tv_log_focus.id, me, 'focus', now(),
    case when together then '{"minutes": 25, "together": true}'::jsonb else '{"minutes": 25}'::jsonb end)
  on conflict on constraint activity_log_pkey do nothing;
end;
$$;
revoke all on function public.tv_log_focus(text, uuid, boolean) from public;
grant execute on function public.tv_log_focus(text, uuid, boolean) to anon, authenticated;
