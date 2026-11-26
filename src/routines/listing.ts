// SPEC §5 Routines: how a routine stands today on a list of routines (its status line and its Start, Continue or
// Resume button), shared by the Routines page and the TV (SPEC §9 Routines).
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { activeSteps, currentRun, finishedOn, habitDoneStepIds, isAnytime, isScheduled, resumableRun, runState, skippedSteps, stepsForDay, type RunState } from '@/routines/rules'
import { messages } from '@/messages'

export interface RoutineToday {
  routine: RoutineRow
  /** Today's steps (habit steps only when their habit is scheduled). */
  steps: RoutineStepRow[]
  state: RunState
  /** Steps skipped in a finished run, which Resume goes back to. */
  skipped: number
  anytime: boolean
  /** Scheduled for today (a run-anytime routine never is). Any routine can still run (SPEC §5). */
  scheduled: boolean
  /** Finished today, by any of today's runs. */
  doneToday: boolean
}

export interface RoutineFacts {
  steps: RoutineStepRow[]
  runs: RoutineRunRow[]
  logs: RoutineStepLogRow[]
  habits: HabitRow[]
  habitLogs: HabitLogRow[]
}

export function routineToday(r: RoutineRow, f: RoutineFacts, today: string): RoutineToday {
  const steps = stepsForDay(activeSteps(f.steps, r.id), f.habits, today)
  const habitDone = habitDoneStepIds(steps, f.habitLogs, today)
  const state = runState(steps, currentRun(r, f.runs, today), f.logs, habitDone)
  const skipped = skippedSteps(steps, resumableRun(r, f.runs, today), f.logs, habitDone).length
  const anytime = isAnytime(r)
  return { routine: r, steps, state, skipped, anytime, scheduled: !anytime && isScheduled(r, today), doneToday: finishedOn(f.runs, r.id, today) }
}

/** The button a routine shows: any routine with steps can run any time (SPEC §5); null only when it has no steps. */
export function routineButton(row: RoutineToday): string | null {
  const m = messages.routines
  if (!row.steps.length) return null
  if (row.state.started) return m.continue
  if (row.skipped) return m.resume
  return row.doneToday ? m.run.startAgain : m.start
}

export function routineStatusText(row: RoutineToday): string {
  const m = messages.routines
  if (!row.steps.length) return m.noSteps
  if (row.state.started) return m.progress(row.state.done, row.state.total)
  if (row.anytime) return row.skipped ? m.finishedSkipped(row.skipped) : m.anytime
  if (row.doneToday) return row.skipped ? m.doneSkipped(row.skipped) : m.doneToday
  return row.scheduled ? m.notStarted : m.notToday
}

/** SPEC §5 Routines, Order: scheduled routines first, then run-anytime ones, each group in the order given. */
export function scheduledFirst<T extends { routine: RoutineRow }>(rows: T[]): T[] {
  return rows.filter((r) => !isAnytime(r.routine)).concat(rows.filter((r) => isAnytime(r.routine)))
}
