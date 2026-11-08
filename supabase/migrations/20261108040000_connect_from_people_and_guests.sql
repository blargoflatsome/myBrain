-- Connections, part 3 (docs/SPEC.md §10 Connections): connect from where people already are.

-- Saved people (my people) whose email belongs to an account show Connect (the user's choice, knowingly showing that
-- they use My Brain). Only by exact email (phones aren't verified yet), never by name; not people I'm already
-- connected with, have blocked or been blocked by, or already asked.
create function public.people_with_accounts()
returns table (person_id uuid)
language sql stable security definer set search_path = '' as $$
  select pe.id
  from public.people pe
  join public.profiles p on lower(p.email) = lower(pe.email) and p.deleted_at is null
  where pe.user_id = auth.uid() and pe.deleted_at is null and pe.email is not null
    and p.user_id <> auth.uid()
    and not public.are_connected(auth.uid(), p.user_id)
    and not public.is_blocked(auth.uid(), p.user_id)
    and not exists (select 1 from public.connection_requests r where r.user_id = auth.uid() and r.to_user = p.user_id
                    and r.status in ('pending', 'declined') and r.expires_at > now() and r.deleted_at is null);
$$;
revoke all on function public.people_with_accounts() from public, anon;
grant execute on function public.people_with_accounts() to authenticated;

-- A signed-in account holder on a guest invitation page: can they be offered "Connect with the host?"
create function public.guest_connect_offer(invite uuid, token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and i.user_id <> auth.uid()
    and not public.are_connected(auth.uid(), i.user_id)
    and not public.is_blocked(auth.uid(), i.user_id)
    and not exists (select 1 from public.connection_requests r where r.user_id = auth.uid() and r.to_user = i.user_id
                    and r.status in ('pending', 'declined') and r.expires_at > now() and r.deleted_at is null)
  from public.guest_invite_row(invite, token) i;
$$;
revoke all on function public.guest_connect_offer(uuid, text) from public, anon;
grant execute on function public.guest_connect_offer(uuid, text) to authenticated;

-- Send the host a connection request from their guest. The host still has to accept.
create function public.guest_connect_with_host(invite uuid, token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  inv public.event_invites := public.guest_invite_row(invite, token);
  ev_title text;
  my_name text;
  req uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if inv.id is null then raise exception 'This link no longer works' using errcode = '42501'; end if;
  if not coalesce(public.guest_connect_offer(invite, token), false) then return; end if;
  if (select count(*) from public.connection_requests r where r.user_id = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'At most 20 connection requests a day' using errcode = '22023';
  end if;
  select e.title into ev_title from public.events e where e.id = inv.event_id;
  select coalesce(p.display_name, 'Someone') into my_name from public.profiles p where p.user_id = me;
  insert into public.connection_requests (user_id, to_contact, to_user)
  values (me, case when length(btrim(coalesce(inv.host_name, ''))) >= 3 then left(inv.host_name, 320) else 'Your host' end, inv.user_id)
  returning id into req;
  perform public.record_notification(inv.user_id, 'connection_request', req,
    my_name || ', your guest at ' || coalesce(ev_title, 'your event') || ', wants to connect', 'Open Connections to answer.', '/connections', now());
end;
$$;
revoke all on function public.guest_connect_with_host(uuid, text) from public, anon;
grant execute on function public.guest_connect_with_host(uuid, text) to authenticated;
