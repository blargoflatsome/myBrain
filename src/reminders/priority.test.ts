import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow, PriorityTaskRow, ReminderStateRow } from '@/sync/types'
import { cancelState, duePriorities, reminderStateId, snoozeState } from './priority'

const NY = 'America/New_York'
const meds: HabitRow = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: 'Take medications',
  notify_time: '08:00',
  timer_minutes: 120,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-11-01',
  is_private: true,
  is_priority: true,
  deleted_at: null,
}
const task: PriorityTaskRow = {
  id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  title: 'Insulin before lunch',
  description: 'Fridge, top shelf',
  reminder_time: '12:00',
  due_date: null,
  weekdays: [1, 2, 3, 4, 5],
  start_date: '2026-11-01',
  deleted_at: null,
}
const at = (iso: string) => new Date(iso)
const due = (now: Date, extra: { logs?: HabitLogRow[]; states?: ReminderStateRow[]; habits?: HabitRow[]; tasks?: PriorityTaskRow[] } = {}) =>
  duePriorities(extra.habits ?? [meds], extra.logs ?? [], extra.tasks ?? [task], [], extra.states ?? [], now, NY)

describe('Spec §5: priority habits get the full-screen reminder at their reminder time', () => {
  it('is not due before 8:00 am and is due after', () => {
    expect(due(at('2026-11-10T12:59:00Z'))).toEqual([]) // 7:59 am
    expect(due(at('2026-11-10T13:01:00Z')).map((d) => d.title)).toEqual(['Take medications'])
  })

  it('stops once completed for the day', () => {
    const done: HabitLogRow = { id: 'l', habit_id: meds.id, date: '2026-11-10', status: 'completed', completed_at: 'x', deleted_at: null }
    expect(due(at('2026-11-10T13:30:00Z'), { logs: [done] })).toEqual([])
  })

  it('ordinary (non-priority) habits never get the full-screen reminder', () => {
    expect(due(at('2026-11-10T13:30:00Z'), { habits: [{ ...meds, is_priority: false }] })).toEqual([])
  })
})

describe('Spec §5: priority tasks, one-off or on chosen weekdays', () => {
  it('a weekday task is due on Tuesday at noon but not on Saturday', () => {
    expect(due(at('2026-11-10T17:01:00Z'), { habits: [] }).map((d) => d.title)).toEqual(['Insulin before lunch'])
    expect(due(at('2026-11-14T17:01:00Z'), { habits: [] })).toEqual([])
  })

  it('a one-off task is due only on its date', () => {
    const once = { ...task, due_date: '2026-11-12', weekdays: null }
    expect(due(at('2026-11-12T17:01:00Z'), { habits: [], tasks: [once] })).toHaveLength(1)
    expect(due(at('2026-11-13T17:01:00Z'), { habits: [], tasks: [once] })).toHaveLength(0)
  })
})

describe('Spec §5: a due priority reminder offers Snooze (10 minutes) and Cancel', () => {
  const now = at('2026-11-10T13:05:00Z')
  const item = due(now)[0]!

  it('snooze hides it for 10 minutes, then it comes back', () => {
    const s = snoozeState(item, undefined, 'u1', now)
    expect(s.snoozed_until).toBe('2026-11-10T13:15:00.000Z')
    expect(s.id).toBe(reminderStateId(meds.id, '2026-11-10'))
    expect(due(at('2026-11-10T13:14:00Z'), { states: [s] })).toEqual([])
    expect(due(at('2026-11-10T13:16:00Z'), { states: [s] }).map((d) => d.id)).toEqual([meds.id])
  })

  it('cancel stops it for the rest of the day without completing the habit', () => {
    const c = cancelState(item, undefined, 'u1', now)
    expect(due(at('2026-11-10T20:00:00Z'), { states: [c], tasks: [] })).toEqual([])
    expect(c).not.toHaveProperty('status')
  })

  it('a cancel yesterday does not carry into today', () => {
    const c = cancelState(item, undefined, 'u1', now)
    expect(due(at('2026-11-11T13:05:00Z'), { states: [c] }).map((d) => d.id)).toEqual([meds.id])
  })
})
