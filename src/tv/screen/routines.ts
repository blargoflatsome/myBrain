// SPEC §9 TV app, Routines: running a routine on the TV is the same run as on my phone. A press works out what to
// save with the main app's routine rules (§5 Routines) from the snapshot, and sends it in one tv_save_routine_step
// call; the server checks it's all mine and fits together.
import type { HabitLogRow, HabitPauseRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { activeSteps, completeSkipped, currentRun, habitDoneStepIds, recordStep, resumableRun, stepsForDay, takesDayId } from '@/routines/rules'
import { toggleAction } from '@/habits/rules'
import { logIdFor } from '@/sync/ids'
import { serverCall } from '@/server/server'

export interface TvRoutineFacts {
  me: string
  steps: RoutineStepRow[]
  runs: RoutineRunRow[]
  logs: RoutineStepLogRow[]
  habits: HabitRow[]
  habitLogs: HabitLogRow[]
  habitPauses: HabitPauseRow[]
}

export interface RoutineSave {
  runs: RoutineRunRow[]
  step_logs: RoutineStepLogRow[]
  habit_log: Pick<HabitLogRow, 'id' | 'habit_id' | 'date' | 'completed_at'> | null
}

/** The habit's log for today, when completing its step should complete it (only while it's still open). */
function habitLogFor(f: TvRoutineFacts, habitId: string | null | undefined, date: string, now: Date, timeZone: string): RoutineSave['habit_log'] {
  const habit = habitId ? f.habits.find((h) => h.id === habitId && !h.deleted_at) : undefined
  if (!habit) return null
  const logs = f.habitLogs.filter((l) => l.habit_id === habit.id)
  if (toggleAction(habit, date, logs, now, timeZone, f.habitPauses).kind !== 'complete') return null
  return { id: logIdFor(habit.id, date), habit_id: habit.id, date, completed_at: now.toISOString() }
}

/** What Skip or Completed on the routine's current step saves, or null when there's no step to press. */
export function stepSave(routine: RoutineRow, f: TvRoutineFacts, status: 'completed' | 'skipped', date: string, now: Date, timeZone: string): (RoutineSave & { finished: boolean }) | null {
  const steps = stepsForDay(activeSteps(f.steps, routine.id), f.habits, date)
  const habitDone = habitDoneStepIds(steps, f.habitLogs, date)
  const action = recordStep(routine, steps, currentRun(routine, f.runs, date), f.logs, status, date, f.me, now, habitDone, undefined, takesDayId(routine, f.runs, date))
  if (!action) return null
  const runs = [action.run, action.finish].filter((r): r is RoutineRunRow => !!r)
  // A new run that also finishes is saved once, finished.
  const one = runs.length === 2 ? [runs[1]!] : runs
  return { runs: one, step_logs: action.logs, habit_log: habitLogFor(f, action.completeHabitId, date, now, timeZone), finished: !!action.finish }
}

/** Resume: what Completed on a step skipped in the finished run saves. */
export function resumeSave(routine: RoutineRow, f: TvRoutineFacts, stepId: string, date: string, now: Date, timeZone: string): RoutineSave | null {
  const run = resumableRun(routine, f.runs, date)
  const log = run ? completeSkipped(f.logs, run, stepId, now) : null
  if (!log) return null
  const step = f.steps.find((s) => s.id === stepId)
  return { runs: [], step_logs: [log], habit_log: habitLogFor(f, step?.habit_id, date, now, timeZone) }
}

/** Saves a press. Only the function's own parameters are sent: the server refuses a call with any other. */
export function saveRoutineStep(deviceKey: string | null, save: RoutineSave) {
  return serverCall<null>('tv_save_routine_step', { device_key: deviceKey, runs: save.runs, step_logs: save.step_logs, habit_log: save.habit_log })
}
