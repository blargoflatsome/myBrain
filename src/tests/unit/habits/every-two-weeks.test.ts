import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow } from '@/sync/types'
import { onWeek } from '@/tasks/days'
import { isScheduled, streaks } from '@/habits/rules'
import { occursOn } from '@/events/rules'
import { isTaskScheduled } from '@/reminders/priority'
import { icsFile } from '@/events/ics'

const habit = (extra: Partial<HabitRow> = {}): HabitRow => ({
  id: 'h1',
  title: 'Water plants',
  notify_time: null,
  timer_minutes: null,
  weekdays: [2],
  start_date: '2026-11-03', // a Tuesday
  current_streak: 0,
  best_streak: 0,
  week_interval: 2,
  deleted_at: null,
  ...extra,
})

describe('Spec §5: every week or every 2 weeks', () => {
  it('every 2 weeks counts from the week of the start date (weeks run Sunday to Saturday)', () => {
    expect(onWeek('2026-11-04', 2, '2026-11-01')).toBe(true) // same week (Sunday)
    expect(onWeek('2026-11-04', 2, '2026-11-08')).toBe(false)
    expect(onWeek('2026-11-04', 2, '2026-11-15')).toBe(true)
    expect(onWeek('2026-11-04', 1, '2026-11-08')).toBe(true)
  })

  it('an every-2-weeks habit is only scheduled in its on weeks, and off weeks never break its streak', () => {
    const h = habit()
    expect(isScheduled(h, '2026-11-03')).toBe(true)
    expect(isScheduled(h, '2026-11-10')).toBe(false)
    expect(isScheduled(h, '2026-11-17')).toBe(true)
    const logs: HabitLogRow[] = ['2026-11-03', '2026-11-17'].map((date) => ({ id: date, habit_id: 'h1', date, status: 'completed', completed_at: `${date}T15:00:00Z`, deleted_at: null }))
    expect(streaks(h, logs, new Date('2026-11-20T12:00:00Z'), 'America/New_York')).toEqual({ current: 2, best: 2 })
  })

  it('repeating priority tasks and events can repeat every 2 weeks', () => {
    const task = { id: 'p', title: 'Shot', reminder_time: '08:00', due_date: null, weekdays: [2], start_date: '2026-11-03', week_interval: 2, deleted_at: null }
    expect(isTaskScheduled(task, '2026-11-10')).toBe(false)
    expect(isTaskScheduled(task, '2026-11-17')).toBe(true)
    expect(occursOn({ start_date: '2026-11-03', repeat: 'biweekly' }, '2026-11-17')).toBe(true)
    expect(occursOn({ start_date: '2026-11-03', repeat: 'biweekly' }, '2026-11-10')).toBe(false)
    const ics = icsFile({ uid: 'x', title: 'Pay day', start_date: '2026-11-06', start_time: null, end_date: '2026-11-06', end_time: null, repeat: 'biweekly', timezone: 'UTC' })
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2')
  })
})

