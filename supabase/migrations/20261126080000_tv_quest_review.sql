-- TV app step 4 review (docs/SPEC.md §9 Go on a Quest): Undo of Mark done pressed again (its first answer lost on the
-- way back) succeeds without changing anything, instead of being refused, so the TV doesn't keep a line it can't clear.

create or replace function public.tv_save_quest(
  device_key text, quest_id uuid, action text, today date default null, log_id uuid default null,
  before_status text default null, before_completed_at timestamptz default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  changed int;
begin
  me := public.tv_owner(device_key);
  if action not in ('pick', 'accept', 'done', 'undo_done')
     or (action in ('done', 'undo_done') and log_id is null)
     or (action = 'done' and (today is null or today not between current_date - 1 and current_date + 1))
     or (action = 'undo_done' and coalesce(before_status, '') not in ('open', 'accepted')) then
    raise exception 'TV quest not allowed' using errcode = '22023';
  end if;

  if action = 'pick' then
    update public.quests q set last_picked_at = now(), times_picked = q.times_picked + 1
    where q.id = quest_id and q.user_id = me and q.deleted_at is null and q.status = 'open';
    get diagnostics changed = row_count;
  elsif action = 'accept' then
    update public.quests q set status = 'accepted'
    where q.id = quest_id and q.user_id = me and q.deleted_at is null and q.status = 'open';
    get diagnostics changed = row_count;
  elsif action = 'done' then
    update public.quests q set status = 'open', completed_at = now()
    where q.id = quest_id and q.user_id = me and q.deleted_at is null and q.status in ('open', 'accepted');
    get diagnostics changed = row_count;
    if changed = 1 then
      -- Pressed again (the TV retrying), the same log stays one completion.
      insert into public.quest_logs (id, user_id, quest_id, date, completed_at)
      values (log_id, me, quest_id, today, now())
      on conflict (id) do nothing;
    end if;
  else
    update public.quest_logs l set deleted_at = now()
    where l.id = log_id and l.user_id = me and l.quest_id = tv_save_quest.quest_id and l.deleted_at is null;
    get diagnostics changed = row_count;
    if changed = 1 then
      update public.quests q set status = before_status::public.quest_status, completed_at = before_completed_at
      where q.id = quest_id and q.user_id = me and q.deleted_at is null;
    elsif exists (
      select 1 from public.quest_logs l
      where l.id = log_id and l.user_id = me and l.quest_id = tv_save_quest.quest_id and l.deleted_at is not null) then
      -- Already undone: nothing more to do.
      changed := 1;
    end if;
  end if;
  if changed = 0 then
    raise exception 'TV quest not allowed' using errcode = '42501';
  end if;
end;
$$;
