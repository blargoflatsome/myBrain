-- TV app step 4 (docs/SPEC.md §9 Go on a Quest, user 2026-11-26): the draw no longer sends every open task's notes on
-- each Pick, only what the picker needs. When a task is picked, the TV asks for that one task in full (tv_draw_task)
-- to show it with its notes.

create or replace function public.tv_quest_draw(device_key text)
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
    -- No notes: the picked task is read in full by tv_draw_task. Today is the TV's own day; a day either side covers
    -- any time zone, and the TV's rules pick the exact ones.
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'due_date', t.due_date, 'priority', t.priority,
        'status', t.status, 'completed_at', t.completed_at, 'cleared_at', t.cleared_at, 'reminder_time', t.reminder_time,
        'source', t.source, 'created_at', t.created_at, 'deleted_at', null))
      from public.tasks t
      where t.user_id = me and t.deleted_at is null and t.status = 'open'
        and (t.due_date is null or t.due_date <= current_date + 1)), '[]'::jsonb)
  );
end;
$$;

-- The task the draw picked, with its notes, to show it. Only my own open task that can be in the draw; null otherwise
-- (crossed off or deleted on my phone meanwhile).
create function public.tv_draw_task(device_key text, task_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
begin
  me := public.tv_owner(device_key);
  return (
    select jsonb_build_object(
      'id', t.id, 'title', t.title, 'notes', t.notes, 'due_date', t.due_date, 'priority', t.priority,
      'status', t.status, 'completed_at', t.completed_at, 'cleared_at', t.cleared_at, 'reminder_time', t.reminder_time,
      'source', t.source, 'created_at', t.created_at, 'deleted_at', null)
    from public.tasks t
    where t.id = task_id and t.user_id = me and t.deleted_at is null and t.status = 'open'
      and (t.due_date is null or t.due_date <= current_date + 1));
end;
$$;
revoke all on function public.tv_draw_task(text, uuid) from public;
grant execute on function public.tv_draw_task(text, uuid) to anon, authenticated;
