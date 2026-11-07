-- "Delete my data" (docs/SPEC.md §8): start fresh without deleting the account. Permanently removes what I added,
-- keeps my account, profile and settings, availability, invitations I received, events I've invited people to, and
-- the log of messages I sent. data_reset_at tells my other devices to clear their stored copy and download again.
alter table public.profiles add column data_reset_at timestamptz;

create or replace function public.delete_my_data()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  delete from public.tasks where user_id = me;
  delete from public.inbox where user_id = me;
  delete from public.quests where user_id = me;
  delete from public.vault_items where user_id = me;
  delete from public.vault_buckets where user_id = me;
  perform public.create_starter_buckets(me);
  delete from public.journal_entries where user_id = me;
  -- Habits and routines take their logs, steps, runs and step logs with them; priority tasks their logs.
  delete from public.routines where user_id = me;
  delete from public.habits where user_id = me;
  delete from public.priority_tasks where user_id = me;
  delete from public.reminder_state where user_id = me;
  -- Tags take their links with them.
  delete from public.tags where user_id = me;
  delete from public.item_tags where user_id = me;
  -- My own events, except ones I've invited people to (those are left alone).
  delete from public.events e
  where e.user_id = me
    and not exists (select 1 from public.event_invites i where i.event_id = e.id and i.deleted_at is null);

  update public.profiles set data_reset_at = at where user_id = me;
  return at;
end;
$$;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
