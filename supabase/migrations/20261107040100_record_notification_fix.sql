-- Fix for 20261107040000: record_notification's parameter names clashed with the notifications table's columns
-- ("column reference kind is ambiguous"), so every reminder run failed. Same function, with clearly named parameters.
drop function public.record_notification(uuid, text, uuid, text, text, text, timestamptz);

create function public.record_notification(p_user uuid, p_kind text, p_item uuid, p_title text, p_body text, p_url text, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  tz text := coalesce((select p.timezone from public.profiles p where p.user_id = p_user), 'UTC');
begin
  insert into public.notifications (user_id, kind, item_id, title, body, url, local_date, sent_at)
  values (p_user, left(p_kind, 40), p_item, left(coalesce(p_title, 'My Brain'), 500), left(coalesce(p_body, ''), 2000),
          case when p_url ~ '^/' then left(p_url, 500) else '/' end, (p_at at time zone tz)::date, p_at)
  on conflict (user_id, kind, item_id, local_date) where deleted_at is null and item_id is not null
  do update set title = excluded.title, body = excluded.body, url = excluded.url, sent_at = excluded.sent_at;
end;
$$;
revoke all on function public.record_notification(uuid, text, uuid, text, text, text, timestamptz) from public, anon, authenticated;
