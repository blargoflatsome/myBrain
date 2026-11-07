// Routine rules (SPEC §5 Routines): weekdays or run anytime, runs, habit steps, next step, and completion stats.
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { addDays } from '@/tasks/days'
import { isScheduled as habitScheduled, weekdayOf } from '@/habits/rules'

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/** A run-anytime routine has no weekdays: no reminder, never missed, progress kept until finished. */
export function isAnytime(routine: RoutineRow): boolean {
  return !routine.weekdays
}

export function isScheduled(routine: RoutineRow, date: string): boolean {
  return !!routine.weekdays && date >= routine.start_date && routine.weekdays.includes(weekdayOf(date))
}

/** The routine's current steps, in order. Removed steps are kept for history but not shown. */
export function activeSteps(steps: RoutineStepRow[], routineId: string): RoutineStepRow[] {
  return steps.filter((s) => s.routine_id === routineId && !s.deleted_at).sort((a, b) => a.position - b.position)
}

/**
 * The steps that apply on a day: a habit step is left out when its habit is deleted or isn't scheduled that day
 * (SPEC §5 Routines: habits as steps). Pass no habits to keep every step.
 */
export function stepsForDay(steps: RoutineStepRow[], habits: HabitRow[] | null, date: string): RoutineStepRow[] {
  if (!habits) return steps
  return steps.filter((s) => {
    if (!s.habit_id) return true
    const habit = habits.find((h) => h.id === s.habit_id)
    return !!habit && !habit.deleted_at && habitScheduled(habit, date)
  })
}

/** The habit a step is linked to, if any (and still there). */
export function habitOf(step: RoutineStepRow, habits: HabitRow[]): HabitRow | undefined {
  return step.habit_id ? habits.find((h) => h.id === step.habit_id && !h.deleted_at) : undefined
}

/** Steps whose habit is already completed on that day: they count as done in the routine. */
export function habitDoneStepIds(steps: RoutineStepRow[], habitLogs: HabitLogRow[], date: string): Set<string> {
  const done = new Set<string>()
  for (const s of steps) {
    if (s.habit_id && habitLogs.some((l) => l.habit_id === s.habit_id && l.date === date && l.status === 'completed' && !l.deleted_at)) {
      done.add(s.id)
    }
  }
  return done
}

/** Fixed ids: one run per scheduled routine per day, one log per step per day, the same on every device (SPEC §7). */
export function runIdFor(routineId: string, date: string): string {
  return `${routineId.slice(0, 24)}${date.replaceAll('-', '')}0000`
}
export function stepLogIdFor(stepId: string, date: string): string {
  return `${stepId.slice(0, 24)}${date.replaceAll('-', '')}0000`
}
/** A run-anytime routine's step log: one per step per run. */
export function runStepLogIdFor(runId: string, stepId: string): string {
  return `${runId.slice(0, 24)}${stepId.slice(24)}`
}

export function runFor(runs: RoutineRunRow[], routineId: string, date: string): RoutineRunRow | undefined {
  return runs.find((r) => r.routine_id === routineId && r.date === date && !r.deleted_at)
}

/**
 * The run in progress: today's run for a scheduled routine; for a run-anytime routine, the latest run not yet
 * finished, whatever day it started (progress carries over until the last step).
 */
export function currentRun(routine: RoutineRow, runs: RoutineRunRow[], date: string): RoutineRunRow | undefined {
  if (!isAnytime(routine)) return runFor(runs, routine.id, date)
  return runs
    .filter((r) => r.routine_id === routine.id && !r.deleted_at && !r.finished_at)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
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

/**
 * Where a routine stands: it continues at the first step not yet completed or skipped. Steps whose habit is already
 * done that day count as passed (SPEC §5: the routine moves past them).
 */
export function runState(
  steps: RoutineStepRow[],
  run: RoutineRunRow | undefined,
  logs: RoutineStepLogRow[],
  habitDone: Set<string> = new Set(),
): RunState {
  const logged = new Set(logsOf(logs, run?.id).map((l) => l.step_id))
  const passed = (s: RoutineStepRow) => logged.has(s.id) || habitDone.has(s.id)
  const current = steps.find((s) => !passed(s)) ?? null
  const done = steps.filter(passed).length
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
  /** The pressed step's log, then logs for steps passed because their habit was already done. */
  logs: RoutineStepLogRow[]
  /** Kept for callers that read one log: the pressed step's. */
  log: RoutineStepLogRow
  /** The run with finished_at set, when nothing is left after this step. */
  finish: RoutineRunRow | null
  /** The habit to complete, when a habit step was completed. */
  completeHabitId: string | null
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
  habitDone: Set<string> = new Set(),
  newId: () => string = () => crypto.randomUUID(),
): StepAction | null {
  const state = runState(steps, run, logs, habitDone)
  if (!state.current) return null
  const at = now.toISOString()
  const anytime = isAnytime(routine)
  const newRun: RoutineRunRow | null = run
    ? null
    : { id: anytime ? newId() : runIdFor(routine.id, date), user_id: userId, routine_id: routine.id, date, started_at: at, finished_at: null, deleted_at: null }
  const theRun = run ?? newRun!
  const logFor = (step: RoutineStepRow, s: 'completed' | 'skipped'): RoutineStepLogRow => ({
    id: anytime ? runStepLogIdFor(theRun.id, step.id) : stepLogIdFor(step.id, date),
    user_id: userId,
    run_id: theRun.id,
    step_id: step.id,
    status: s,
    logged_at: at,
    deleted_at: null,
  })
  const logged = new Set(logsOf(logs, theRun.id).map((l) => l.step_id))
  const out = [logFor(state.current, status)]
  logged.add(state.current.id)
  // Steps passed because their habit was already done get a "completed" log too, so the stats count them.
  for (const s of steps) {
    if (!logged.has(s.id) && habitDone.has(s.id) && steps.indexOf(s) < steps.indexOf(state.current)) {
      out.push(logFor(s, 'completed'))
      logged.add(s.id)
    }
  }
  const next = steps.find((s) => !logged.has(s.id) && !habitDone.has(s.id))
  if (!next) {
    for (const s of steps) if (!logged.has(s.id)) out.push(logFor(s, 'completed'))
  }
  return {
    run: newRun,
    logs: out,
    log: out[0]!,
    finish: next ? null : { ...theRun, finished_at: at },
    completeHabitId: status === 'completed' ? (state.current.habit_id ?? null) : null,
  }
}

export interface RoutineStats {
  completed: number
  possible: number
  steps: { step: RoutineStepRow; completed: number; skipped: number; possible: number }[]
}

/**
 * Completion stats (SPEC §5 Routines). Scheduled routines: possible days are scheduled days from the start (a step's
 * own start for step stats) up to yesterday, plus today once finished; days never started count as possible; skips
 * count as possible; a habit step is only possible on days its habit is scheduled. Run-anytime routines: completed is
 * the number of finished runs, and each step is possible once per finished run.
 */
export function routineStats(
  routine: RoutineRow,
  allSteps: RoutineStepRow[],
  runs: RoutineRunRow[],
  logs: RoutineStepLogRow[],
  today: string,
  habits: HabitRow[] | null = null,
): RoutineStats {
  const steps = activeSteps(allSteps, routine.id)
  const perStep = steps.map((step) => ({ step, completed: 0, skipped: 0, possible: 0 }))

  if (isAnytime(routine)) {
    const finished = runs.filter((r) => r.routine_id === routine.id && !r.deleted_at && r.finished_at)
    for (const run of finished) {
      const runLogs = logsOf(logs, run.id)
      for (const s of perStep) {
        s.possible++
        const log = runLogs.find((l) => l.step_id === s.step.id)
        if (log?.status === 'completed') s.completed++
        else if (log?.status === 'skipped') s.skipped++
      }
    }
    return { completed: finished.length, possible: finished.length, steps: perStep }
  }

  const todayRun = runFor(runs, routine.id, today)
  const lastDay = todayRun?.finished_at ? today : addDays(today, -1)
  let completed = 0
  let possible = 0
  for (let date = routine.start_date; date <= lastDay; date = addDays(date, 1)) {
    if (!isScheduled(routine, date)) continue
    possible++
    const run = runFor(runs, routine.id, date)
    if (run?.finished_at) completed++
    const dayLogs = logsOf(logs, run?.id)
    const dayIds = new Set(stepsForDay(steps, habits, date).map((s) => s.id))
    for (const s of perStep) {
      if (date < s.step.start_date || !dayIds.has(s.step.id)) continue
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
