import { describe, expect, it } from 'vitest'
import type { RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { activeSteps, completeSkipped, isScheduled, percent, recordStep, resumableRun, routineStats, runFor, runIdFor, runState, skippedSteps, stepLogIdFor } from '@/routines/rules'

const RID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const routine: RoutineRow = { id: RID, title: 'Morning', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null }
const step = (n: number, title: string, extra: Partial<RoutineStepRow> = {}): RoutineStepRow => ({
  id: `0000000${n}-0000-4000-8000-00000000000${n}`,
  routine_id: RID,
  position: n,
  title,
  start_date: '2026-11-01',
  deleted_at: null,
  ...extra,
})
const steps = [step(1, 'Wake up by 7am'), step(2, 'Brush teeth'), step(3, 'Shower')]

/** Play a whole day through recordStep, the way the run screen does. */
function play(date: string, actions: ('completed' | 'skipped')[], runs: RoutineRunRow[], logs: RoutineStepLogRow[]) {
  for (const status of actions) {
    const action = recordStep(routine, steps, runFor(runs, RID, date), logs, status, date, 'u1')!
    if (action.run) runs.push(action.run)
    logs.push(action.log)
    if (action.finish) runs.splice(runs.findIndex((r) => r.id === action.finish!.id), 1, action.finish)
  }
}

describe('Spec §5 Routines: completing a step shows the next step', () => {
  it('starts at the first step', () => {
    expect(runState(steps, undefined, [])).toMatchObject({ index: 1, total: 3, started: false, finished: false })
    expect(runState(steps, undefined, []).current?.title).toBe('Wake up by 7am')
  })

  it('Completed and Skip both move on, and are recorded as completed / skipped', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    play('2026-11-10', ['completed'], runs, logs)
    expect(runState(steps, runs[0], logs).current?.title).toBe('Brush teeth')
    play('2026-11-10', ['skipped'], runs, logs)
    expect(runState(steps, runs[0], logs).current?.title).toBe('Shower')
    expect(logs.map((l) => l.status)).toEqual(['completed', 'skipped'])
  })

  it('reaching the last step finishes the routine, even with skips', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    play('2026-11-10', ['skipped', 'skipped', 'completed'], runs, logs)
    expect(runs[0]!.finished_at).toBeTruthy()
    expect(runState(steps, runs[0], logs)).toMatchObject({ current: null, finished: true, done: 3 })
  })

  it('Resume: a finished run offers just its skipped steps, and completing one turns its log into completed', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    play('2026-11-10', ['completed', 'skipped'], runs, logs)
    expect(resumableRun(routine, runs, '2026-11-10')).toBeUndefined() // still running
    play('2026-11-10', ['skipped'], runs, logs)
    const run = resumableRun(routine, runs, '2026-11-10')!
    expect(skippedSteps(steps, run, logs).map((s) => s.title)).toEqual(['Brush teeth', 'Shower'])
    const fixed = completeSkipped(logs, run, steps[1]!.id)!
    expect(fixed).toMatchObject({ id: stepLogIdFor(steps[1]!.id, '2026-11-10'), status: 'completed' })
    logs.splice(logs.findIndex((l) => l.id === fixed.id), 1, fixed)
    expect(skippedSteps(steps, run, logs).map((s) => s.title)).toEqual(['Shower'])
    expect(routineStats(routine, steps, runs, logs, '2026-11-10').steps[1]).toMatchObject({ completed: 1, skipped: 0 })
  })

  it('Resume on a run-anytime routine goes back to its latest finished run, until a new run starts', () => {
    const anytime = { ...routine, weekdays: null }
    const finished: RoutineRunRow = { id: 'r1', user_id: 'u1', routine_id: RID, date: '2026-11-08', started_at: '2026-11-08T10:00:00Z', finished_at: '2026-11-08T11:00:00Z', deleted_at: null }
    expect(resumableRun(anytime, [finished], '2026-11-10')?.id).toBe('r1')
    const open: RoutineRunRow = { ...finished, id: 'r2', started_at: '2026-11-10T10:00:00Z', finished_at: null }
    expect(resumableRun(anytime, [finished, open], '2026-11-10')).toBeUndefined()
  })

  it('a run left partway continues at the first step not yet done', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    play('2026-11-10', ['completed', 'completed'], runs, logs)
    expect(runState(steps, runs[0], logs)).toMatchObject({ index: 3, started: true, finished: false })
  })

  it('removed steps are not shown but keep their history', () => {
    const withRemoved = [...steps, step(4, 'Old step', { deleted_at: '2026-11-05T00:00:00Z' })]
    expect(activeSteps(withRemoved, RID).map((s) => s.title)).toEqual(['Wake up by 7am', 'Brush teeth', 'Shower'])
  })
})

describe('Spec §5 Routines: chosen weekdays', () => {
  it('runs only on its chosen weekdays, from the day it was created', () => {
    const weekdays = { ...routine, weekdays: [1, 2, 3, 4, 5], start_date: '2026-11-02' }
    expect(isScheduled(weekdays, '2026-11-09')).toBe(true) // Monday
    expect(isScheduled(weekdays, '2026-11-08')).toBe(false) // Sunday
    expect(isScheduled(weekdays, '2026-10-30')).toBe(false) // before start
  })
})

describe('Spec §5 Routines: completion stats', () => {
  it('counts completed days against every scheduled day, including days never started', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    play('2026-11-01', ['completed', 'completed', 'completed'], runs, logs)
    play('2026-11-02', ['completed', 'skipped', 'completed'], runs, logs)
    play('2026-11-03', ['completed'], runs, logs) // left partway: not completed
    // Nov 4 never started. Checked on Nov 5 (today not finished yet, so not counted).
    const stats = routineStats(routine, steps, runs, logs, '2026-11-05')
    expect(stats).toMatchObject({ completed: 2, possible: 4 })
    expect(percent(stats.completed, stats.possible)).toBe(50)
  })

  it('per step: completed vs possible, and skipped steps still count as possible', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    play('2026-11-01', ['completed', 'completed', 'completed'], runs, logs)
    play('2026-11-02', ['completed', 'skipped', 'completed'], runs, logs)
    const stats = routineStats(routine, steps, runs, logs, '2026-11-03')
    expect(stats.steps.map((s) => [s.step.title, s.completed, s.skipped, s.possible])).toEqual([
      ['Wake up by 7am', 2, 0, 2],
      ['Brush teeth', 1, 1, 2],
      ['Shower', 2, 0, 2],
    ])
  })

  it('today counts once finished, not while still in progress', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    const fresh = { ...routine, start_date: '2026-11-10' }
    expect(routineStats(fresh, steps, runs, logs, '2026-11-10')).toMatchObject({ completed: 0, possible: 0 })
    play('2026-11-10', ['completed', 'completed', 'completed'], runs, logs)
    expect(routineStats(fresh, steps, runs, logs, '2026-11-10')).toMatchObject({ completed: 1, possible: 1 })
  })

  it("a step's stats start the day it was added", () => {
    const added = [...steps, step(4, 'Skin care', { start_date: '2026-11-03' })]
    const stats = routineStats(routine, added, [], [], '2026-11-05')
    expect(stats.steps.find((s) => s.step.title === 'Skin care')?.possible).toBe(2) // Nov 3, 4
  })

  it('unscheduled days are not possible', () => {
    const weekdays = { ...routine, weekdays: [1, 2, 3, 4, 5], start_date: '2026-11-07' } // from Saturday
    expect(routineStats(weekdays, steps, [], [], '2026-11-10').possible).toBe(1) // only Mon Nov 9
  })
})

describe('Spec §7: one run per routine per day across devices', () => {
  it('runs and step logs get fixed ids for the day', () => {
    expect(runIdFor(RID, '2026-11-10')).toBe('aaaaaaaa-bbbb-4ccc-8ddd-202611100000')
    expect(stepLogIdFor(steps[0]!.id, '2026-11-10')).toBe('00000001-0000-4000-8000-202611100000')
  })
})
