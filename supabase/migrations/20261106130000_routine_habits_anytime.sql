-- Routines can include habits as steps, and can be run anytime (docs/SPEC.md §5 Routines).

-- ---------- Run anytime: no weekdays (and so no reminder) ----------
alter table public.routines alter column weekdays drop not null;
alter table public.routines drop constraint routines_weekdays_check;
alter table public.routines add constraint routines_weekdays_check
  check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'));
alter table public.routines add constraint routines_anytime_has_no_reminder
  check (weekdays is not null or notify_time is null);

-- A run-anytime routine keeps one run going across days until it is finished, and can be started again the same
-- day. Scheduled routines still have one run per day: their run ids are fixed per routine and day (SPEC §7).
drop index public.routine_runs_one_per_day;

-- ---------- Habit steps ----------
alter table public.routine_steps add column habit_id uuid;
-- A step can only link to a habit owned by the same user.
alter table public.routine_steps add constraint routine_steps_habit_owner
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade;
create index routine_steps_habit_idx on public.routine_steps (habit_id) where habit_id is not null;
