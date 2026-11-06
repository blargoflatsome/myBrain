import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow } from '@/sync/types'
import { dayStatus, deadline, isScheduled, logIdFor, missedDaysToRecord, newHabit, streaks, toggleAction, weekdayOf, zonedTime } from './rules'

const NY = 'America/New_York'

function habit(over: Partial<HabitRow> = {}): HabitRow {
  return { id: 'h1', title: 'Stretch', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', is_private: false, deleted_at: null, ...over }
}
function done(date: string, extra: Partial<HabitLogRow> = {}): HabitLogRow {
  return { id: `l-${date}`, habit_id: 'h1', date, status: 'completed', completed_at: `${date}T12:00:00Z`, deleted_at: null, ...extra }
}
function missed(date: string): HabitLogRow {
  return { id: `m-${date}`, habit_id: 'h1', date, status: 'missed', deleted_at: null }
}
const at = (iso: string) => new Date(iso)

describe('Spec §5 Habits: the timer starts at the notify time', () => {
  const h = habit({ notify_time: '08:00', timer_minutes: 120 })

  it('notify 8:00 am + 2 hours = due by 10:00 am New York time', () => {
    expect(new Date(deadline(h, '2026-11-10', NY)).toISOString()).toBe('2026-11-10T15:00:00.000Z')
  })

  it('open at 9:59 am, missed at 10:01 am', () => {
    expect(dayStatus(h, '2026-11-10', [], at('2026-11-10T14:59:00Z'), NY)).toBe('open')
    expect(dayStatus(h, '2026-11-10', [], at('2026-11-10T15:01:00Z'), NY)).toBe('missed')
  })

  it('completed before the timer runs out counts as done', () => {
    expect(dayStatus(h, '2026-11-10', [done('2026-11-10')], at('2026-11-10T20:00:00Z'), NY)).toBe('completed')
  })

  it('with no timer the habit is due by midnight local time', () => {
    const noTimer = habit({ notify_time: '08:00' })
    expect(dayStatus(noTimer, '2026-11-10', [], at('2026-11-11T04:59:00Z'), NY)).toBe('open') // 11:59 pm
    expect(dayStatus(noTimer, '2026-11-10', [], at('2026-11-11T05:01:00Z'), NY)).toBe('missed') // 12:01 am
  })

  it('daylight saving: notify 8:00 am is 8:00 am local on both sides of the change', () => {
    expect(new Date(zonedTime('2026-10-31', '08:00', NY)).toISOString()).toBe('2026-10-31T12:00:00.000Z') // EDT
    expect(new Date(zonedTime('2026-11-02', '08:00', NY)).toISOString()).toBe('2026-11-02T13:00:00.000Z') // EST
    expect(new Date(zonedTime('2026-03-08', '08:00', NY)).toISOString()).toBe('2026-03-08T12:00:00.000Z') // spring forward day
  })

  it('midnight deadline on the 25-hour fall-back day is still local midnight', () => {
    expect(new Date(deadline(habit(), '2026-11-01', NY)).toISOString()).toBe('2026-11-02T05:00:00.000Z')
  })
})

describe('Spec §5 Habits: chosen weekdays', () => {
  const weekdaysOnly = habit({ weekdays: [1, 2, 3, 4, 5] }) // Mon–Fri

  it('knows the weekday of a date', () => {
    expect(weekdayOf('2026-11-08')).toBe(0) // Sunday
    expect(weekdayOf('2026-11-09')).toBe(1) // Monday
  })

  it('a habit only counts on its chosen weekdays and from the day it was created', () => {
    expect(isScheduled(weekdaysOnly, '2026-11-09')).toBe(true)
    expect(isScheduled(weekdaysOnly, '2026-11-08')).toBe(false)
    expect(isScheduled(weekdaysOnly, '2026-10-30')).toBe(false) // before start
  })

  it('unscheduled days neither extend nor break the streak', () => {
    // Fri Nov 6 and Mon Nov 9 done, weekend skipped; checked Mon evening.
    const logs = [done('2026-11-06'), done('2026-11-09')]
    const h = habit({ weekdays: [1, 2, 3, 4, 5], start_date: '2026-11-06' })
    expect(streaks(h, logs, at('2026-11-10T00:00:00Z'), NY)).toEqual({ current: 2, best: 2 })
  })
})

describe('Spec §5 Habits: streaks and best streak', () => {
  it('scheduled days in a row build the streak', () => {
    const logs = ['2026-11-01', '2026-11-02', '2026-11-03'].map((d) => done(d))
    expect(streaks(habit(), logs, at('2026-11-04T01:00:00Z'), NY)).toEqual({ current: 3, best: 3 })
  })

  it('a missed day resets the streak to zero and keeps the best streak as the goal to beat', () => {
    const logs = [done('2026-11-01'), done('2026-11-02'), done('2026-11-03'), missed('2026-11-04'), done('2026-11-05')]
    expect(streaks(habit(), logs, at('2026-11-06T01:00:00Z'), NY)).toEqual({ current: 1, best: 3 })
  })

  it('a day with nothing logged after its deadline counts as a miss even before the miss is written', () => {
    const logs = [done('2026-11-01'), done('2026-11-02')] // nothing on Nov 3
    expect(streaks(habit(), logs, at('2026-11-04T15:00:00Z'), NY).current).toBe(0)
  })

  it('today, still open, does not break the streak', () => {
    const logs = [done('2026-11-01'), done('2026-11-02')]
    expect(streaks(habit(), logs, at('2026-11-03T15:00:00Z'), NY)).toEqual({ current: 2, best: 2 }) // Nov 3, 10 am
  })

  it('an expired timer is a miss: the streak resets, the best is kept', () => {
    const h = habit({ notify_time: '08:00', timer_minutes: 60, start_date: '2026-11-01' })
    const logs = [done('2026-11-01'), done('2026-11-02')]
    expect(streaks(h, logs, at('2026-11-03T14:30:00Z'), NY)).toEqual({ current: 0, best: 2 }) // 9:30 am, due 9:00
  })

  it('history is recalculated from the logs, so deleted logs do not count', () => {
    const logs = [done('2026-11-01', { deleted_at: '2026-11-01T13:00:00Z' })]
    expect(streaks(habit(), logs, at('2026-11-02T01:00:00Z'), NY)).toEqual({ current: 0, best: 0 })
  })
})

describe('Spec §5 Habits: misses are logged for the day', () => {
  it('records each scheduled day whose deadline passed with nothing logged', () => {
    const h = habit({ weekdays: [1, 3, 5], start_date: '2026-11-02' }) // Mon/Wed/Fri
    expect(missedDaysToRecord(h, [done('2026-11-04')], at('2026-11-10T15:00:00Z'), NY)).toEqual(['2026-11-02', '2026-11-06', '2026-11-09'])
  })

  it('does not record today while it is still open', () => {
    expect(missedDaysToRecord(habit({ start_date: '2026-11-10' }), [], at('2026-11-10T15:00:00Z'), NY)).toEqual([])
  })
})

describe('Spec §5 Habits: completing and undoing', () => {
  const h = habit({ notify_time: '08:00', timer_minutes: 120 })

  it('an open habit can be completed', () => {
    expect(toggleAction(h, '2026-11-10', [], at('2026-11-10T14:00:00Z'), NY).kind).toBe('complete')
  })

  it('a completion can be undone until the deadline', () => {
    const logs = [done('2026-11-10')]
    expect(toggleAction(h, '2026-11-10', logs, at('2026-11-10T14:59:00Z'), NY).kind).toBe('undo')
    expect(toggleAction(h, '2026-11-10', logs, at('2026-11-10T15:01:00Z'), NY).kind).toBe('none')
  })

  it('a missed habit cannot be completed afterwards', () => {
    expect(toggleAction(h, '2026-11-10', [], at('2026-11-10T16:00:00Z'), NY).kind).toBe('none')
  })
})

describe('Spec §7: one log per habit per day across devices', () => {
  it('the same habit and day always get the same log id, a valid uuid', () => {
    const id = logIdFor('3f2b6c1e-9a7d-4c2e-8b1a-0f9e8d7c6b5a', '2026-11-10')
    expect(id).toBe('3f2b6c1e-9a7d-4c2e-8b1a-202611100000')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(logIdFor('3f2b6c1e-9a7d-4c2e-8b1a-0f9e8d7c6b5a', '2026-11-11')).not.toBe(id)
  })
})

describe('Spec §5 Habits: new habits', () => {
  it('repeat every day, are not private, and start today in my timezone', () => {
    const h = newHabit(' Drink water ', 'u1', NY, at('2026-11-11T03:00:00Z'), 'x') // 10 pm Nov 10 in NY
    expect(h).toMatchObject({ title: 'Drink water', weekdays: [0, 1, 2, 3, 4, 5, 6], is_private: false, start_date: '2026-11-10' })
  })
})
