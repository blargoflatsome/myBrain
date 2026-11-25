-- When I drop out, the push to the host and everyone still going says who dropped out (SPEC §5 Cancelling); it used to
-- read "Change of plans" over my own message, which doesn't name me. Only the subject changes. Draft wording.
create or replace function public.drop_out(event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  ev public.events;
  mine public.event_invites;
  template text;
  who text;
  inv record;
begin
  select * into ev from public.events e where e.id = event and e.deleted_at is null;
  select i.* into mine from public.event_invites i join public.invite_recipients r on r.invite_id = i.id
  where i.event_id = event and r.user_id = me and i.deleted_at is null;
  if ev.id is null or mine.id is null then raise exception 'Not your event' using errcode = '42501'; end if;
  if mine.response = 'dropped' then return; end if;
  update public.event_invites set response = 'dropped', responded_at = now() where id = mine.id;
  select p.cancel_dropout_message, coalesce(nullif(trim(p.display_name), ''), nullif(trim(mine.name), ''), 'Someone')
    into template, who from public.profiles p where p.user_id = me;
  perform public.queue_message(me, ev.id, mine.id, ev.user_id, mine.host_name, null, null, 'dropout',
    who || ' dropped out of ' || ev.title, public.fill_message(template, mine.host_name, ev));
  for inv in
    select i.*, r.user_id as recipient from public.event_invites i left join public.invite_recipients r on r.invite_id = i.id
    where i.event_id = event and i.deleted_at is null and i.id <> mine.id and i.response not in ('no', 'dropped')
  loop
    perform public.queue_message(me, ev.id, inv.id, inv.recipient, inv.name, inv.email, inv.phone, 'dropout',
      who || ' dropped out of ' || ev.title, public.fill_message(template, inv.name, ev));
  end loop;
end;
$$;
