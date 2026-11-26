// SPEC §5 Routines: how a routine stands today on a list of routines (its status line and its Start, Continue or
// Resume button), shared by the Routines page and the TV (SPEC §9 Routines).
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { activeSteps, currentRun, habitDoneStepIds, isAnytime, isScheduled, resumableRun, runState, skippedSteps, stepsForDay, type RunState } from '@/routines/rules'
import { messages } from '@/messages'

export interface RoutineToday {
  routine: RoutineRow
  /** Today's steps (habit steps only when their habit is scheduled). */
  steps: RoutineStepRow[]
  state: RunState
  /** Steps skipped in a finished run, which Resume goes back to. */
  skipped: number
  anytime: boolean
  /** Can run today: run anytime, or scheduled today. */
  scheduled: boolean
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
  return { routine: r, steps, state, skipped, anytime, scheduled: anytime || isScheduled(r, today) }
}

/** The button a routine shows today, or null when there's nothing to run. */
export function routineButton(row: RoutineToday): string | null {
  const m = messages.routines
  if (!row.scheduled || !row.steps.length || (row.state.finished && !row.skipped)) return null
  return row.skipped ? m.resume : row.state.started ? m.continue : m.start
}

export function routineStatusText(row: RoutineToday): string {
  const m = messages.routines
  if (!row.steps.length) return m.noSteps
  if (row.anytime) return row.state.started ? m.progress(row.state.done, row.state.total) : row.skipped ? m.finishedSkipped(row.skipped) : m.anytime
  if (!row.scheduled) return m.notToday
  if (row.state.finished) return row.skipped ? m.doneSkipped(row.skipped) : m.doneToday
  if (row.state.started) return m.progress(row.state.done, row.state.total)
  return m.notStarted
}
