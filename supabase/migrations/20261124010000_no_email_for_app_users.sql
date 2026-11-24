-- Automatic email was dropped (2026-11-24, SPEC §10 and §5 Accounts and contact info).
-- App users get event news by push only, so stop queuing a "waiting" email for them, mark the
-- ones already waiting as skipped (they were never going to be sent), and drop the unused
-- "Event news reaches me by" column and its type. Guests are unchanged: their rows still log the
-- one-at-a-time sharing flow and honour opt-outs.

create or replace function public.queue_message(
  sender uuid, ev uuid, inv uuid, to_user uuid, to_name text, to_email text, to_phone text,
  msg_kind text, msg_subject text, msg_body text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if to_user is not null then
    insert into public.outbound_messages (user_id, event_id, invite_id, recipient_user_id, recipient_name, channel, kind, subject, body)
    values (sender, ev, inv, to_user, to_name, 'push', msg_kind, msg_subject, msg_body);
    return;
  end if;
  if to_email is not null then
    insert into public.outbound_messages (user_id, event_id, invite_id, recipient_name, recipient_email, channel, kind, subject, body, status)
    values (sender, ev, inv, to_name, to_email, 'email', msg_kind, msg_subject, msg_body,
            case when exists (select 1 from public.message_optouts o where o.address_hash = public.address_hash(to_email)) then 'skipped' else 'waiting' end);
  elsif to_phone is not null then
    insert into public.outbound_messages (user_id, event_id, invite_id, recipient_name, recipient_phone, channel, kind, subject, body, status)
    values (sender, ev, inv, to_name, to_phone, 'text', msg_kind, msg_subject, msg_body,
            case when exists (select 1 from public.message_optouts o where o.address_hash = public.address_hash(public.normalize_phone(to_phone))) then 'skipped' else 'waiting' end);
  end if;
end;
$$;
revoke execute on function public.queue_message(uuid, uuid, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;

update public.outbound_messages
set status = 'skipped'
where channel = 'email' and recipient_user_id is not null and status = 'waiting';

alter table public.profiles drop column event_notify_method;
drop type public.event_notify_method;
