-- Step 3: task priority levels (SPEC §5 Tasks): 1 = Low (default), 2 = Medium, 3 = High.
update public.tasks set priority = 1 where priority not in (1, 2, 3);
alter table public.tasks alter column priority set default 1;
alter table public.tasks add constraint tasks_priority_level check (priority in (1, 2, 3));
create index tasks_user_due_idx on public.tasks (user_id, due_date) where deleted_at is null;
