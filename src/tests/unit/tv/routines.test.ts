import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { resumeSave, stepSave, type TvRoutineFacts } from '@/tv/screen/routines'
import { logIdFor } from '@/sync/ids'
import { runIdFor } from '@/routines/rules'

const TZ = 'America/New_York'
const TODAY = '2026-11-26'
const NOW = new Date('2026-11-26T15:00:00Z')
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const routine = (extra: Partial<RoutineRow> = {}): RoutineRow => ({ id: id(1), title: 'Morning', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null, ...extra })
const step = (n: number, extra: Partial<RoutineStepRow> = {}): RoutineStepRow => ({ id: id(100 + n), routine_id: id(1), position: n, title: `Step ${n}`, start_date: '2026-11-01', deleted_at: null, ...extra })
const pills: HabitRow = { id: id(50), title: 'Take medication', notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', current_streak: 0, best_streak: 0, deleted_at: null }
const facts = (extra: Partial<TvRoutineFacts> = {}): TvRoutineFacts => ({ me: 'me', steps: [], runs: [], logs: [], habits: [pills], habitLogs: [], habitPauses: [], ...extra })

describe('SPEC §9 Routines: what a press on the TV saves (the same run as on my phone)', () => {
  it('Completed on a habit step starts today\'s run and completes the habit for the day', () => {
    const save = stepSave(routine(), facts({ steps: [step(1, { habit_id: pills.id }), step(2)] }), 'completed', TODAY, NOW, TZ)
    expect(save).toMatchObject({
      runs: [{ id: runIdFor(id(1), TODAY), routine_id: id(1), date: TODAY, finished_at: null }],
      step_logs: [{ step_id: step(1).id, status: 'completed' }],
      habit_log: { id: logIdFor(pills.id, TODAY), habit_id: pills.id, date: TODAY },
      finished: false,
    })
  })

  it('a habit already missed that day (its timer ran out) is left alone', () => {
    const timed: HabitRow = { ...pills, notify_time: '08:00', timer_minutes: 30 } // NOW is 10:00 am in New York
    const missed: HabitLogRow = { id: logIdFor(pills.id, TODAY), habit_id: pills.id, date: TODAY, status: 'missed', deleted_at: null }
    const save = stepSave(routine(), facts({ steps: [step(1, { habit_id: pills.id }), step(2)], habits: [timed], habitLogs: [missed] }), 'completed', TODAY, NOW, TZ)
    expect(save).toMatchObject({ step_logs: [{ step_id: step(1).id, status: 'completed' }], habit_log: null })
  })

  it('a habit already done that day passes its step, which is logged completed with the next press', () => {
    const done: HabitLogRow = { id: logIdFor(pills.id, TODAY), habit_id: pills.id, date: TODAY, status: 'completed', deleted_at: null }
    const save = stepSave(routine(), facts({ steps: [step(1, { habit_id: pills.id }), step(2)], habitLogs: [done] }), 'skipped', TODAY, NOW, TZ)
    expect(save).toMatchObject({ step_logs: [{ step_id: step(2).id, status: 'skipped' }, { step_id: step(1).id, status: 'completed' }], habit_log: null, finished: true })
  })

  it('a run that starts and finishes in one press is saved once, finished', () => {
    const save = stepSave(routine(), facts({ steps: [step(1)] }), 'skipped', TODAY, NOW, TZ)
    expect(save?.runs).toHaveLength(1)
    expect(save).toMatchObject({ runs: [{ id: runIdFor(id(1), TODAY), finished_at: NOW.toISOString() }], finished: true })
  })

  it('Resume turns the skipped step\'s log into completed and completes its habit', () => {
    const run: RoutineRunRow = { id: runIdFor(id(1), TODAY), routine_id: id(1), date: TODAY, started_at: '2026-11-26T12:00:00Z', finished_at: '2026-11-26T12:05:00Z', deleted_at: null }
    const log: RoutineStepLogRow = { id: id(900), run_id: run.id, step_id: step(1).id, status: 'skipped', logged_at: '2026-11-26T12:01:00Z', deleted_at: null }
    const save = resumeSave(routine(), facts({ steps: [step(1, { habit_id: pills.id })], runs: [run], logs: [log] }), step(1).id, TODAY, NOW, TZ)
    expect(save).toMatchObject({ runs: [], step_logs: [{ id: log.id, status: 'completed' }], habit_log: { habit_id: pills.id } })
  })
})
