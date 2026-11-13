import { describe, expect, it } from 'vitest'
import { isScheduled, onMonthDay } from '@/habits/rules'
import type { HabitRow } from '@/sync/types'

const habit = (extra: Partial<HabitRow>): HabitRow => ({
  id: 'h',
  user_id: 'u',
  title: 'x',
  notify_time: '15:00',
  timer_minutes: null,
  weekdays: [4],
  start_date: '2026-11-12',
  current_streak: 0,
  best_streak: 0,
  deleted_at: null,
  ...extra,
})

describe('Spec §5 Habits: start date and how often', () => {
  it('two Thursday habits every 2 weeks, starting a week apart, alternate (Recycling and Trash)', () => {
    const recycling = habit({ week_interval: 2, start_date: '2026-11-12' })
    const trash = habit({ week_interval: 2, start_date: '2026-11-19' })
    const thursdays = ['2026-11-12', '2026-11-19', '2026-11-26', '2026-12-03']
    expect(thursdays.map((d) => isScheduled(recycling, d))).toEqual([true, false, true, false])
    expect(thursdays.map((d) => isScheduled(trash, d))).toEqual([false, true, false, true])
  })

  it('never before the start date', () => {
    expect(isScheduled(habit({ start_date: '2026-11-19' }), '2026-11-12')).toBe(false)
  })

  it('every month on the start date’s day; a 31st falls on a shorter month’s last day', () => {
    const rent = habit({ monthly: true, start_date: '2026-11-12', weekdays: [0, 1, 2, 3, 4, 5, 6] })
    expect(isScheduled(rent, '2026-12-12')).toBe(true)
    expect(isScheduled(rent, '2026-12-13')).toBe(false)
    expect(onMonthDay('2026-01-31', '2026-02-28')).toBe(true)
    expect(onMonthDay('2026-01-31', '2026-04-30')).toBe(true)
    expect(onMonthDay('2026-01-31', '2026-03-30')).toBe(false)
  })
})

