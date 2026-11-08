-- Today's notifications (docs/SPEC.md §5 Dashboard, §6): every reminder and piece of event news sent today is kept
-- for the Dashboard list, synced to every device, and cleared at midnight in each person's time zone.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (length(kind) <= 40),
  item_id uuid,
  title text not null check (length(title) <= 500),
  body text not null default '' check (length(body) <= 2000),
  url text not null default '/' check (url ~ '^/' and length(url) <= 500),
  local_date date not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger notifications_set_updated_at before insert or update on public.notifications
  for each row execute function public.set_updated_at();
alter table public.notifications enable row level security;
create policy "notifications: owner can read" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications: owner can insert" on public.notifications for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "notifications: owner can update" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.notifications from anon;
create index notifications_user_updated_idx on public.notifications (user_id, updated_at);
-- One entry per reminder per day: a reminder sent again (a priority nag) updates its entry instead of adding more.
create unique index notifications_one_per_item_day on public.notifications (user_id, kind, item_id, local_date)
  where deleted_at is null and item_id is not null;
alter publication supabase_realtime add table public.notifications;

create or replace function public.record_notification(uid uuid, kind text, item uuid, title text, body text, url text, at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  tz text := coalesce((select p.timezone from public.profiles p where p.user_id = uid), 'UTC');
begin
  insert into public.notifications (user_id, kind, item_id, title, body, url, local_date, sent_at)
  values (uid, left(kind, 40), item, left(coalesce(title, 'My Brain'), 500), left(coalesce(body, ''), 2000),
          case when url ~ '^/' then left(url, 500) else '/' end, (at at time zone tz)::date, at)
  on conflict (user_id, kind, item_id, local_date) where deleted_at is null and item_id is not null
  do update set title = excluded.title, body = excluded.body, url = excluded.url, sent_at = excluded.sent_at;
end;
$$;
revoke all on function public.record_notification(uuid, text, uuid, text, text, text, timestamptz) from public, anon, authenticated;

-- At midnight in each person's time zone their notifications are cleared (soft-deleted so every device hears about it),
-- and a week later removed for good. Runs every hour, since midnight comes at different times around the world.
create or replace function public.expire_notifications()
returns void language sql security definer set search_path = '' as $$
  update public.notifications n set deleted_at = now()
  from public.profiles p
  where p.user_id = n.user_id and n.deleted_at is null and n.local_date < (now() at time zone p.timezone)::date;
  delete from public.notifications where deleted_at < now() - interval '7 days';
$$;
revoke all on function public.expire_notifications() from public, anon, authenticated;
select cron.schedule('my-brain-expire-notifications', '5 * * * *', 'select public.expire_notifications()');

-- Reminders and event news now also record a notification.
create or replace function public.send_due_reminders(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  p record;
  txt record;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
  app_url constant text := 'https://myadhdbrain.netlify.app';
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';

  for r in select * from public.due_reminders(at) loop
    select * into p from public.profiles where user_id = r.user_id;
    select * into txt from public.reminder_text(r.kind, r.title, r.is_priority, r.detail);
    -- Kept for today's list on the Dashboard, whether or not it reaches a device (SPEC §6).
    perform public.record_notification(r.user_id, r.kind, r.item_id, txt.heading, txt.body, r.url, at);

    if p.notify_ntfy and p.ntfy_topic is not null and length(p.ntfy_topic) >= 16 then
      -- ntfy JSON publishing: POST to the server root with the topic in the body.
      select net.http_post(
        url := 'https://ntfy.sh',
        body := jsonb_build_object(
          'topic', p.ntfy_topic,
          'title', txt.heading,
          'message', txt.body,
          'priority', case when r.is_priority then 5 else 3 end,
          'tags', case when r.is_priority then jsonb_build_array('rotating_light') else jsonb_build_array('brain') end,
          'click', app_url || r.url
        )
      ) into req;
      insert into public.notification_log (user_id, kind, item_id, channel, request_id) values (r.user_id, r.kind, r.item_id, 'ntfy', req);
    end if;

    if p.notify_web_push and fn_url is not null and fn_secret is not null then
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
      from public.push_subscriptions s where s.user_id = r.user_id and s.deleted_at is null;
      if subs is not null then
        select net.http_post(
          url := fn_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
          body := jsonb_build_object(
            'subscriptions', subs,
            'payload', jsonb_build_object(
              'title', txt.heading,
              'body', txt.body,
              'url', r.url,
              'tag', r.kind || ':' || r.item_id,
              'priority', r.is_priority
            )
          )
        ) into req;
        insert into public.notification_log (user_id, kind, item_id, channel, request_id) values (r.user_id, r.kind, r.item_id, 'webpush', req);
      end if;
    end if;

    insert into public.reminder_state (user_id, kind, item_id, date, last_sent_at)
    values (r.user_id, r.kind, r.item_id, r.local_date, at)
    on conflict (kind, item_id, date) where deleted_at is null do update set last_sent_at = excluded.last_sent_at;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

create or replace function public.send_outbound()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  m record;
  p record;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
  app_url constant text := 'https://myadhdbrain.netlify.app';
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';
  for m in select * from public.outbound_messages o where o.status = 'queued' and o.channel = 'push' order by o.created_at limit 200 loop
    select * into p from public.profiles where user_id = m.recipient_user_id;
    perform public.record_notification(m.recipient_user_id, 'event_' || m.kind, m.id, coalesce(m.subject, 'My Brain'), m.body,
      '/calendar?event=' || coalesce(m.event_id::text, ''), now());
    select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
    from public.push_subscriptions s where s.user_id = m.recipient_user_id and s.deleted_at is null;
    if p.notify_web_push and subs is not null and fn_url is not null and fn_secret is not null then
      select net.http_post(
        url := fn_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
        body := jsonb_build_object('subscriptions', subs, 'payload', jsonb_build_object(
          'title', coalesce(m.subject, 'My Brain'), 'body', m.body, 'url', '/calendar?event=' || coalesce(m.event_id::text, ''),
          'tag', m.kind || ':' || coalesce(m.event_id::text, m.id::text), 'priority', false))
      ) into req;
    end if;
    if p.notify_ntfy and p.ntfy_topic is not null and length(p.ntfy_topic) >= 16 then
      select net.http_post(url := 'https://ntfy.sh', body := jsonb_build_object(
        'topic', p.ntfy_topic, 'title', coalesce(m.subject, 'My Brain'), 'message', m.body, 'priority', 3,
        'click', app_url || '/calendar?event=' || coalesce(m.event_id::text, ''))) into req;
    end if;
    update public.outbound_messages
    set status = case when (subs is not null and p.notify_web_push) or (p.notify_ntfy and p.ntfy_topic is not null) then 'sent' else 'skipped' end,
        sent_at = now(),
        error = case when (subs is not null and p.notify_web_push) or (p.notify_ntfy and p.ntfy_topic is not null) then null else 'no device set up for notifications' end
    where id = m.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
