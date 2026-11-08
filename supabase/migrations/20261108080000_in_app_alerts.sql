-- In-app alerts (docs/SPEC.md §6): every notification is also an alert under the bell. An alert is seen when I tap
-- it (read_at), kept for 7 days, and a reminder sent again (a priority nag) counts as new again.
alter table public.notifications add column read_at timestamptz;
create index notifications_unread_idx on public.notifications (user_id) where read_at is null and deleted_at is null;

create or replace function public.record_notification(p_user uuid, p_kind text, p_item uuid, p_title text, p_body text, p_url text, p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  tz text := coalesce((select p.timezone from public.profiles p where p.user_id = p_user), 'UTC');
begin
  insert into public.notifications (user_id, kind, item_id, title, body, url, local_date, sent_at)
  values (p_user, left(p_kind, 40), p_item, left(coalesce(p_title, 'My Brain'), 500), left(coalesce(p_body, ''), 2000),
          case when p_url ~ '^/' then left(p_url, 500) else '/' end, (p_at at time zone tz)::date, p_at)
  on conflict (user_id, kind, item_id, local_date) where deleted_at is null and item_id is not null
  do update set title = excluded.title, body = excluded.body, url = excluded.url, sent_at = excluded.sent_at, read_at = null;
end;
$$;
revoke all on function public.record_notification(uuid, text, uuid, text, text, text, timestamptz) from public, anon, authenticated;

-- Kept for 7 days (no longer cleared at midnight).
create or replace function public.expire_notifications()
returns void language sql security definer set search_path = '' as $$
  update public.notifications n set deleted_at = now()
  where n.deleted_at is null and n.sent_at < now() - interval '7 days';
  delete from public.notifications where deleted_at < now() - interval '7 days';
$$;
revoke all on function public.expire_notifications() from public, anon, authenticated;
