// Routine rules (SPEC §5 Routines): weekdays, runs, next step, and completion stats.
import type { RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { addDays } from '@/tasks/days'
import { weekdayOf } from '@/habits/rules'

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

export function isScheduled(routine: RoutineRow, date: string): boolean {
  return date >= routine.start_date && routine.weekdays.includes(weekdayOf(date))
}

/** The routine's current steps, in order. Removed steps are kept for history but not shown. */
export function activeSteps(steps: RoutineStepRow[], routineId: string): RoutineStepRow[] {
  return steps.filter((s) => s.routine_id === routineId && !s.deleted_at).sort((a, b) => a.position - b.position)
}

/** Fixed ids: one run per routine per day, one log per step per day, the same on every device (SPEC §7). */
export function runIdFor(routineId: string, date: string): string {
  return `${routineId.slice(0, 24)}${date.replaceAll('-', '')}0000`
}
export function stepLogIdFor(stepId: string, date: string): string {
  return `${stepId.slice(0, 24)}${date.replaceAll('-', '')}0000`
}

export function runFor(runs: RoutineRunRow[], routineId: string, date: string): RoutineRunRow | undefined {
  return runs.find((r) => r.routine_id === routineId && r.date === date && !r.deleted_at)
}

function logsOf(logs: RoutineStepLogRow[], runId: string | undefined) {
  return runId ? logs.filter((l) => l.run_id === runId && !l.deleted_at) : []
}

export interface RunState {
  /** The step to show now, or null when the run is finished (or the routine has no steps). */
  current: RoutineStepRow | null
  /** 1-based position of the current step among the active steps. */
  index: number
  total: number
  done: number
  finished: boolean
  started: boolean
}

/** Where a routine stands today: it continues at the first step not yet completed or skipped. */
export function runState(steps: RoutineStepRow[], run: RoutineRunRow | undefined, logs: RoutineStepLogRow[]): RunState {
  const logged = new Set(logsOf(logs, run?.id).map((l) => l.step_id))
  const current = steps.find((s) => !logged.has(s.id)) ?? null
  const done = steps.filter((s) => logged.has(s.id)).length
  return {
    current,
    index: current ? steps.indexOf(current) + 1 : steps.length,
    total: steps.length,
    done,
    finished: !!run?.finished_at || (steps.length > 0 && !current && !!run),
    started: !!run,
  }
}

export interface StepAction {
  run: RoutineRunRow | null
  log: RoutineStepLogRow
  /** The run with finished_at set, when this was the last step. */
  finish: RoutineRunRow | null
}

/** What pressing Skip or Completed on the current step saves (SPEC §5 Routines). */
export function recordStep(
  routine: RoutineRow,
  steps: RoutineStepRow[],
  run: RoutineRunRow | undefined,
  logs: RoutineStepLogRow[],
  status: 'completed' | 'skipped',
  date: string,
  userId: string,
  now: Date = new Date(),
): StepAction | null {
  const state = runState(steps, run, logs)
  if (!state.current) return null
  const at = now.toISOString()
  const newRun: RoutineRunRow | null = run
    ? null
    : { id: runIdFor(routine.id, date), user_id: userId, routine_id: routine.id, date, started_at: at, finished_at: null, deleted_at: null }
  const theRun = run ?? newRun!
  const log: RoutineStepLogRow = {
    id: stepLogIdFor(state.current.id, date),
    user_id: userId,
    run_id: theRun.id,
    step_id: state.current.id,
    status,
    logged_at: at,
    deleted_at: null,
  }
  const isLast = state.index === state.total
  return { run: newRun, log, finish: isLast ? { ...theRun, finished_at: at } : null }
}

export interface RoutineStats {
  completed: number
  possible: number
  steps: { step: RoutineStepRow; completed: number; skipped: number; possible: number }[]
}

/**
 * Completion stats (SPEC §5 Routines). Possible days are scheduled days from the start (a step's own start for step
 * stats) up to yesterday, plus today once finished. Days never started count as possible. Skips count as possible.
 */
export function routineStats(
  routine: RoutineRow,
  allSteps: RoutineStepRow[],
  runs: RoutineRunRow[],
  logs: RoutineStepLogRow[],
  today: string,
): RoutineStats {
  const steps = activeSteps(allSteps, routine.id)
  const todayRun = runFor(runs, routine.id, today)
  const lastDay = todayRun?.finished_at ? today : addDays(today, -1)
  let completed = 0
  let possible = 0
  const perStep = steps.map((step) => ({ step, completed: 0, skipped: 0, possible: 0 }))

  for (let date = routine.start_date; date <= lastDay; date = addDays(date, 1)) {
    if (!isScheduled(routine, date)) continue
    possible++
    const run = runFor(runs, routine.id, date)
    if (run?.finished_at) completed++
    const dayLogs = logsOf(logs, run?.id)
    for (const s of perStep) {
      if (date < s.step.start_date) continue
      s.possible++
      const log = dayLogs.find((l) => l.step_id === s.step.id)
      if (log?.status === 'completed') s.completed++
      else if (log?.status === 'skipped') s.skipped++
    }
  }
  return { completed, possible, steps: perStep }
}

export function percent(done: number, possible: number): number {
  return possible ? Math.round((done / possible) * 100) : 0
}
