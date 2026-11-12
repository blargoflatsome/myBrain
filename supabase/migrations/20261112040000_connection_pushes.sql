-- Connection requests and acceptances reach my phone (docs/SPEC.md §5 Connections, §6): they were alerts under the
-- bell only. Every minute, alerts of these kinds not yet pushed go out by Web Push and/or ntfy, as I've chosen. They
-- wait while I'm in quiet hours and go out when quiet hours end. One I've already seen in the app, or older than a
-- day, isn't pushed.
alter table public.notifications add column pushed_at timestamptz;
-- Alerts from before this change are never pushed.
update public.notifications set pushed_at = coalesce(sent_at, now()) where kind in ('connection_request', 'connection_accepted');
create index notifications_to_push_idx on public.notifications (created_at)
  where pushed_at is null and deleted_at is null and kind in ('connection_request', 'connection_accepted');

-- The app uploads whole rows (marking one seen), so a copy from before the push could set this back to empty and push
-- it twice. Once pushed, it stays pushed.
create function public.keep_pushed_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.pushed_at := coalesce(old.pushed_at, new.pushed_at);
  return new;
end;
$$;
create trigger notifications_keep_pushed_at before update on public.notifications
  for each row execute function public.keep_pushed_at();

create function public.in_quiet_hours(p public.profiles, at timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select case
    when p.quiet_hours_start is null or p.quiet_hours_end is null then false
    when p.quiet_hours_start <= p.quiet_hours_end
      then (at at time zone coalesce(p.timezone, 'UTC'))::time >= p.quiet_hours_start
       and (at at time zone coalesce(p.timezone, 'UTC'))::time < p.quiet_hours_end
    else (at at time zone coalesce(p.timezone, 'UTC'))::time >= p.quiet_hours_start
      or (at at time zone coalesce(p.timezone, 'UTC'))::time < p.quiet_hours_end
  end;
$$;

create function public.send_connection_pushes(at timestamptz default now())
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n record;
  p public.profiles;
  subs jsonb;
  fn_url text;
  fn_secret text;
  req bigint;
  sent integer := 0;
  app_url constant text := 'https://myadhdbrain.netlify.app';
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'push_secret';
  for n in
    select * from public.notifications x
    where x.pushed_at is null and x.deleted_at is null and x.kind in ('connection_request', 'connection_accepted')
    order by x.created_at limit 200
  loop
    select * into p from public.profiles where user_id = n.user_id;
    -- Already seen in the app, too old, or no profile: nothing to push.
    if n.read_at is not null or n.created_at < at - interval '1 day' or p.user_id is null then
      update public.notifications set pushed_at = at where id = n.id;
      continue;
    end if;
    if public.in_quiet_hours(p, at) then continue; end if;
    if p.notify_web_push and fn_url is not null and fn_secret is not null then
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) into subs
      from public.push_subscriptions s where s.user_id = n.user_id and s.deleted_at is null;
      if subs is not null then
        select net.http_post(
          url := fn_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', fn_secret),
          body := jsonb_build_object('subscriptions', subs, 'payload', jsonb_build_object(
            'title', n.title, 'body', n.body, 'url', n.url, 'tag', n.kind || ':' || coalesce(n.item_id::text, n.id::text),
            'priority', false))
        ) into req;
      end if;
    end if;
    if p.notify_ntfy and p.ntfy_topic is not null and length(p.ntfy_topic) >= 16 then
      select net.http_post(url := 'https://ntfy.sh', body := jsonb_build_object(
        'topic', p.ntfy_topic, 'title', n.title, 'message', n.body, 'priority', 3, 'click', app_url || n.url)) into req;
    end if;
    update public.notifications set pushed_at = at where id = n.id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function public.send_connection_pushes(timestamptz) from public, anon, authenticated;
revoke all on function public.in_quiet_hours(public.profiles, timestamptz) from public, anon, authenticated;

select cron.schedule('my-brain-connection-pushes', '* * * * *', 'select public.send_connection_pushes()');
