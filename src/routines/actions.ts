// Reading and writing routines, their steps and runs (SPEC §5 Routines).
import type { HabitRow, RoutineRow, RoutineStepRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { activeSteps, completeSkipped, currentRun, habitDoneStepIds, recordStep, resumableRun, stepsForDay } from '@/routines/rules'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { achieved } from '@/celebrate/bus'

export function routineActions({ ready }: ActionContext, completeHabit: (habit: HabitRow, now: Date) => Promise<void>) {
  /** A new routine starts today, runs every day, with no steps yet. */
  function newRoutine(userId: string | null): RoutineRow {
    return {
      id: crypto.randomUUID(),
      user_id: userId ?? undefined,
      title: '',
      notify_time: null,
      weekdays: null, // a new routine runs any time until I give it a schedule (SPEC §5 Routines)
      start_date: todayIn(deviceTimeZone()),
      deleted_at: null,
    }
  }

  /**
   * Save a routine and its ordered steps. Steps keep their ids so history stays attached; steps no longer in the
   * list are soft-deleted (their history is kept, SPEC §5 Routines).
   */
  async function saveRoutine(routine: RoutineRow, steps: { id?: string; title: string; habitId?: string | null }[]) {
    const { engine: e, uid, local } = ready()
    await e.save('routines', { ...routine, user_id: uid })
    const existing = activeSteps(await local.routine_steps.where('routine_id').equals(routine.id).toArray(), routine.id)
    const keep = new Set<string>()
    const today = todayIn(deviceTimeZone())
    for (const [position, s] of steps.entries()) {
      if (!s.title.trim()) continue
      const before = s.id ? existing.find((x) => x.id === s.id) : undefined
      const habitId = s.habitId ?? null
      const row: RoutineStepRow = before
        ? { ...before, title: s.title.trim(), position, habit_id: habitId }
        : { id: crypto.randomUUID(), user_id: uid, routine_id: routine.id, position, title: s.title.trim(), habit_id: habitId, start_date: today, deleted_at: null }
      keep.add(row.id)
      if (!before || before.title !== row.title || before.position !== row.position || (before.habit_id ?? null) !== habitId) {
        await e.save('routine_steps', row)
      }
    }
    await e.removeMany('routine_steps', existing.filter((old) => !keep.has(old.id)).map((old) => old.id))
  }

  async function deleteRoutine(id: string) {
    await ready().engine.remove('routines', id)
  }

  /** Press Skip or Completed on the routine's current step for today. */
  async function recordRoutineStep(routine: RoutineRow, status: 'completed' | 'skipped', now = new Date()) {
    const { engine: e, uid, local } = ready()
    const date = todayIn(deviceTimeZone(), now)
    const habits = await local.habits.toArray()
    const steps = stepsForDay(activeSteps(await local.routine_steps.where('routine_id').equals(routine.id).toArray(), routine.id), habits, date)
    const runs = await local.routine_runs.where('routine_id').equals(routine.id).toArray()
    const run = currentRun(routine, runs, date)
    const logs = run ? await local.routine_step_logs.where('run_id').equals(run.id).toArray() : []
    const habitDone = habitDoneStepIds(steps, await local.habit_logs.toArray(), date)
    const action = recordStep(routine, steps, run, logs, status, date, uid, now, habitDone)
    if (!action) return null
    if (action.run) await e.save('routine_runs', action.run)
    for (const log of action.logs) await e.save('routine_step_logs', log)
    if (action.finish) await e.save('routine_runs', action.finish)
    if (status === 'completed' || action.finish) achieved({ kind: 'step', finished: !!action.finish })
    // A completed habit step completes the habit for the day too (one tick counts for both).
    if (action.completeHabitId) {
      const habit = habits.find((h) => h.id === action.completeHabitId && !h.deleted_at)
      if (habit) await completeHabit(habit, now)
    }
    return action
  }

  /** Resume: press Completed on a step skipped in the routine's finished run (SPEC §5 Routines). */
  async function completeSkippedStep(routine: RoutineRow, stepId: string, now = new Date()) {
    const { engine: e, local } = ready()
    const date = todayIn(deviceTimeZone(), now)
    const run = resumableRun(routine, await local.routine_runs.where('routine_id').equals(routine.id).toArray(), date)
    if (!run) return null
    const logs = await local.routine_step_logs.where('run_id').equals(run.id).toArray()
    const log = completeSkipped(logs, run, stepId, now)
    if (!log) return null
    await e.save('routine_step_logs', log)
    const left = logs.filter((l) => !l.deleted_at && l.status === 'skipped' && l.step_id !== stepId).length
    achieved({ kind: 'step', finished: left === 0 })
    const step = await local.routine_steps.get(stepId)
    const habit = step?.habit_id ? await local.habits.get(step.habit_id) : undefined
    if (habit && !habit.deleted_at) await completeHabit(habit, now)
    return log
  }

  return { newRoutine, saveRoutine, deleteRoutine, recordRoutineStep, completeSkippedStep }
}
