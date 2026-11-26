-- TV app step 4, Go on a Quest (docs/SPEC.md §9): the TV draws a quest with every §5 Random Quest rule. The draw is
-- read fresh each time Pick or Re-roll is pressed (tv_quest_draw), so recent picks are current; the pick is made on the
-- TV with the shared picker rules. The writes are the pick and its outcomes: tv_save_quest (picked, accepted, done and
-- its Undo) and tv_save_draw_task (a task from the draw crossed off, or an Undated one given today's date).

-- What the draw needs: my open and accepted quests with their details, and the open tasks that can be in the draw
-- (due today or earlier, or Undated), with their notes.
create function public.tv_quest_draw(device_key text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
begin
  me := public.tv_owner(device_key);
  return jsonb_build_object(
    'quests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'title', q.title, 'details', q.details, 'energy_level', q.energy_level, 'time_bucket', q.time_bucket,
        'status', q.status, 'last_picked_at', q.last_picked_at, 'times_picked', q.times_picked,
        'completed_at', q.completed_at, 'deleted_at', null))
      from public.quests q
      where q.user_id = me and q.deleted_at is null and q.status in ('open', 'accepted')), '[]'::jsonb),
    -- Today is the TV's own day; a day either side covers any time zone, and the TV's rules pick the exact ones.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'notes', t.notes, 'due_date', t.due_date, 'priority', t.priority,
        'status', t.status, 'completed_at', t.completed_at, 'cleared_at', t.cleared_at, 'reminder_time', t.reminder_time,
        'source', t.source, 'created_at', t.created_at, 'deleted_at', null))
      from public.tasks t
      where t.user_id = me and t.deleted_at is null and t.status = 'open'
        and (t.due_date is null or t.due_date <= current_date + 1)), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.tv_quest_draw(text) from public;
grant execute on function public.tv_quest_draw(text) to anon, authenticated;

-- A quest picked (counted, so the last few picked are skipped), accepted (In progress), done (logged, back in the
-- list), or that done undone (its log removed, the quest as it was). Only my own quest, in a state the action fits.
create function public.tv_save_quest(
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
    end if;
  end if;
  if changed = 0 then
    raise exception 'TV quest not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.tv_save_quest(text, uuid, text, date, uuid, text, timestamptz) from public;
grant execute on function public.tv_save_quest(text, uuid, text, date, uuid, text, timestamptz) to anon, authenticated;

-- A task the draw picked: Done crosses it off; Do it today gives an Undated task today's date. Only my own open task
-- that can be in the draw.
create function public.tv_save_draw_task(device_key text, task_id uuid, action text, today date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  changed int;
begin
  me := public.tv_owner(device_key);
  if action not in ('done', 'today') or today is null or today not between current_date - 1 and current_date + 1 then
    raise exception 'TV task not allowed' using errcode = '22023';
  end if;
  if action = 'done' then
    update public.tasks t set status = 'done', completed_at = now()
    where t.id = task_id and t.user_id = me and t.deleted_at is null and t.status = 'open'
      and (t.due_date is null or t.due_date <= today);
  else
    update public.tasks t set due_date = today
    where t.id = task_id and t.user_id = me and t.deleted_at is null and t.status = 'open' and t.due_date is null;
  end if;
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'TV task not allowed' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.tv_save_draw_task(text, uuid, text, date) from public;
grant execute on function public.tv_save_draw_task(text, uuid, text, date) to anon, authenticated;
