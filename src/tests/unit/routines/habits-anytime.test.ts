import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { currentRun, habitDoneStepIds, isAnytime, isScheduled, recordStep, routineStats, runIdFor, runState, stepsForDay } from '@/routines/rules'

const RID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const MEDS = 'mmmmmmmm-0000-4000-8000-000000000001'
const step = (n: number, title: string, extra: Partial<RoutineStepRow> = {}): RoutineStepRow => ({
  id: `0000000${n}-0000-4000-8000-00000000000${n}`,
  routine_id: RID,
  position: n,
  title,
  start_date: '2026-11-01',
  deleted_at: null,
  ...extra,
})
const habit = (extra: Partial<HabitRow> = {}): HabitRow => ({
  id: MEDS,
  title: 'Take medication',
  notify_time: null,
  timer_minutes: null,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-11-01',
  is_private: false,
  current_streak: 0,
  best_streak: 0,
  deleted_at: null,
  ...extra,
})
const doneLog = (date: string): HabitLogRow => ({ id: `l-${date}`, habit_id: MEDS, date, status: 'completed', completed_at: `${date}T12:00:00Z`, deleted_at: null })

const morning: RoutineRow = { id: RID, title: 'Morning', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null }
const steps = [step(1, 'Wake up'), step(2, 'Take medication', { habit_id: MEDS }), step(3, 'Shower')]

describe('Spec §5 Routines: habits as steps', () => {
  it('a habit step is left out on days its habit is not scheduled, or once the habit is deleted', () => {
    expect(stepsForDay(steps, [habit()], '2026-11-10').map((s) => s.title)).toEqual(['Wake up', 'Take medication', 'Shower'])
    expect(stepsForDay(steps, [habit({ weekdays: [1] })], '2026-11-10').map((s) => s.title)).toEqual(['Wake up', 'Shower'])
    expect(stepsForDay(steps, [habit({ deleted_at: 'x' })], '2026-11-10').map((s) => s.title)).toEqual(['Wake up', 'Shower'])
  })

  it('completing a habit step asks for the habit to be completed too; skipping does not', () => {
    const run = { id: runIdFor(RID, '2026-11-10'), routine_id: RID, date: '2026-11-10', started_at: 'x', finished_at: null, deleted_at: null }
    const logs: RoutineStepLogRow[] = [{ id: 'a', run_id: run.id, step_id: steps[0]!.id, status: 'completed', logged_at: 'x', deleted_at: null }]
    expect(recordStep(morning, steps, run, logs, 'completed', '2026-11-10', 'u1')!.completeHabitId).toBe(MEDS)
    expect(recordStep(morning, steps, run, logs, 'skipped', '2026-11-10', 'u1')!.completeHabitId).toBeNull()
  })

  it('a habit already done that day counts as passed, and is logged as completed when the routine moves past it', () => {
    const done = habitDoneStepIds(steps, [doneLog('2026-11-10')], '2026-11-10')
    expect(done).toEqual(new Set([steps[1]!.id]))
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    const first = recordStep(morning, steps, undefined, [], 'completed', '2026-11-10', 'u1', new Date(), done)!
    runs.push(first.run!)
    logs.push(...first.logs)
    expect(runState(steps, runs[0], logs, done).current?.title).toBe('Shower')
    const last = recordStep(morning, steps, runs[0], logs, 'completed', '2026-11-10', 'u1', new Date(), done)!
    expect(last.logs.map((l) => [l.step_id, l.status])).toEqual([
      [steps[2]!.id, 'completed'],
      [steps[1]!.id, 'completed'],
    ])
    expect(last.finish).not.toBeNull()
  })

  it('when the last steps are habits already done, finishing the step before them finishes the routine', () => {
    const done = new Set([steps[2]!.id])
    const twoDone = [steps[0]!, steps[2]!]
    const action = recordStep(morning, twoDone, undefined, [], 'completed', '2026-11-10', 'u1', new Date(), done)!
    expect(action.finish).not.toBeNull()
    expect(action.logs).toHaveLength(2)
  })

  it('a habit step only counts in the stats on days its habit is scheduled', () => {
    const stats = routineStats(morning, steps, [], [], '2026-11-08', [habit({ weekdays: [1, 2, 3, 4, 5] })])
    // Nov 1 to Nov 7: 7 days, of which Mon-Fri (Nov 2-6) is 5 days.
    expect(stats.steps.map((s) => s.possible)).toEqual([7, 5, 7])
  })
})

describe('Spec §5 Routines: run anytime', () => {
  const garage: RoutineRow = { id: RID, title: 'Clean the garage', weekdays: null, start_date: '2026-11-01', deleted_at: null }
  const gsteps = [step(1, 'Sort tools'), step(2, 'Sweep'), step(3, 'Recycle boxes')]
  const newId = () => crypto.randomUUID()

  it('has no schedule: never "scheduled", so never missed', () => {
    expect(isAnytime(garage)).toBe(true)
    expect(isScheduled(garage, '2026-11-10')).toBe(false)
    expect(routineStats(garage, gsteps, [], [], '2026-11-30')).toMatchObject({ completed: 0, possible: 0 })
  })

  it('progress carries over between days until the last step, then a fresh run can start', () => {
    const runs: RoutineRunRow[] = []
    const logs: RoutineStepLogRow[] = []
    const play = (date: string) => {
      const a = recordStep(garage, gsteps, currentRun(garage, runs, date), logs, 'completed', date, 'u1', new Date(`${date}T15:00:00Z`), new Set(), newId)!
      if (a.run) runs.push(a.run)
      logs.push(...a.logs)
      if (a.finish) runs.splice(runs.findIndex((r) => r.id === a.finish!.id), 1, a.finish)
    }
    play('2026-11-07') // Saturday: step 1
    play('2026-11-08') // Sunday: carries on with step 2, same run
    expect(runs).toHaveLength(1)
    expect(runState(gsteps, currentRun(garage, runs, '2026-11-09'), logs).current?.title).toBe('Recycle boxes')
    play('2026-11-09')
    expect(currentRun(garage, runs, '2026-11-09')).toBeUndefined()
    expect(routineStats(garage, gsteps, runs, logs, '2026-11-09')).toMatchObject({ completed: 1, possible: 1 })

    // Start again the same day: a fresh run with its own step logs.
    play('2026-11-09')
    expect(runs).toHaveLength(2)
    expect(new Set(logs.map((l) => l.id)).size).toBe(logs.length)
  })
})
