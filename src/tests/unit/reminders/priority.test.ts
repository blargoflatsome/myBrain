import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow, ReminderStateRow, TaskRow } from '@/sync/types'
import { cancelState, duePriorities, reminderStateId, snoozeState } from '@/reminders/priority'

const NY = 'America/New_York'
const meds: HabitRow = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  title: 'Take medications',
  notify_time: '08:00',
  timer_minutes: 120,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  start_date: '2026-11-01',
  is_priority: true,
  deleted_at: null,
}
const task: TaskRow = {
  id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  title: 'Insulin before lunch',
  notes: 'Fridge, top shelf',
  priority: 3,
  reminder_time: '12:00',
  due_date: '2026-11-10',
  status: 'open',
  source: 'manual',
  deleted_at: null,
}
const at = (iso: string) => new Date(iso)
const due = (now: Date, extra: { logs?: HabitLogRow[]; states?: ReminderStateRow[]; habits?: HabitRow[]; tasks?: TaskRow[] } = {}) =>
  duePriorities(extra.habits ?? [meds], extra.logs ?? [], extra.tasks ?? [task], extra.states ?? [], now, NY)

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

describe('Spec §5 High-priority tasks: a High task with a reminder gets the full-screen reminder', () => {
  const titles = (now: Date, tasks: TaskRow[]) => due(now, { habits: [], tasks }).map((d) => d.title)

  it('at its time on its day, and each later day while it carries over, until it is crossed off', () => {
    expect(titles(at('2026-11-10T16:59:00Z'), [task])).toEqual([]) // 11:59 am
    expect(titles(at('2026-11-10T17:01:00Z'), [task])).toEqual(['Insulin before lunch'])
    expect(titles(at('2026-11-09T17:01:00Z'), [task])).toEqual([]) // the day before
    expect(titles(at('2026-11-12T17:01:00Z'), [task])).toEqual(['Insulin before lunch']) // carried over
    expect(titles(at('2026-11-10T17:01:00Z'), [{ ...task, status: 'done' }])).toEqual([])
  })

  it('only High tasks with a reminder time', () => {
    expect(titles(at('2026-11-10T17:01:00Z'), [{ ...task, priority: 2 }])).toEqual([])
    expect(titles(at('2026-11-10T17:01:00Z'), [{ ...task, reminder_time: null }])).toEqual([])
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
