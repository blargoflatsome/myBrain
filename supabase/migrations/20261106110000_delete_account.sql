-- Account deletion (docs/SPEC.md §9 and §5 Account page): "Delete My Account" removes me and everything I own.
-- Every table's user_id references auth.users with ON DELETE CASCADE, so deleting the user removes all of my rows
-- (tasks, vault, quests, inbox, habits and logs, routines and history, priority tasks, reminders, push subscriptions,
-- journal, profile). This is the one hard delete in the app, by design.
-- A signed-in user can only ever delete themselves: the function takes no arguments and uses auth.uid().
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
