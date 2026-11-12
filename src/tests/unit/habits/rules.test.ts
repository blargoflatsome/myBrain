import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitPauseRow, HabitRow } from '@/sync/types'
import { dayStatus, deadline, isScheduled, keptLately, pauseFrom, resumeAfter, logIdFor, missedDaysToRecord, newHabit, streaks, toggleAction, weekdayOf, wrongMisses, zonedTime } from '@/habits/rules'

import { addDays } from '@/tasks/days'

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

describe('Spec §5 Habits: the day a habit is created stays open until midnight', () => {
  const LA = 'America/Los_Angeles'
  // The reported case: created 11:17 am with a 9:00 am reminder and a 1-hour timer.
  const pills = habit({ title: 'Take Morning Pills', notify_time: '09:00:00', timer_minutes: 60, start_date: '2026-11-06' })

  it('is not missed when created after its timer window', () => {
    expect(dayStatus(pills, '2026-11-06', [], at('2026-11-06T19:17:19Z'), LA)).toBe('open')
    expect(missedDaysToRecord(pills, [], at('2026-11-06T19:17:19Z'), LA)).toEqual([])
  })

  it('is due by midnight on the creation day, then missed if not done', () => {
    expect(dayStatus(pills, '2026-11-06', [], at('2026-11-07T07:59:00Z'), LA)).toBe('open') // 11:59 pm
    expect(dayStatus(pills, '2026-11-06', [], at('2026-11-07T08:01:00Z'), LA)).toBe('missed') // 12:01 am
  })

  it('from the next day the timer applies as normal', () => {
    expect(new Date(deadline(pills, '2026-11-07', LA)).toISOString()).toBe('2026-11-07T18:00:00.000Z') // 10:00 am
  })

  it('a "missed" log written too early does not count, and is flagged for removal', () => {
    const early = { ...missed('2026-11-06'), habit_id: pills.id }
    expect(dayStatus(pills, '2026-11-06', [early], at('2026-11-06T20:00:00Z'), LA)).toBe('open')
    expect(wrongMisses(pills, [early], at('2026-11-06T20:00:00Z'), LA)).toEqual([early])
    expect(wrongMisses(pills, [early], at('2026-11-07T09:00:00Z'), LA)).toEqual([])
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

  it("two years of history: every day counted, with another habit's logs and deleted logs mixed in", () => {
    // Done every day for two years except every 50th day, which was left empty (a miss), plus a deleted log on
    // one of those days and another habit's logs that must not count. The last week has an 11 pm notify time
    // and a 2-hour timer, so yesterday's deadline is 1 am today.
    const h = habit({ start_date: '2024-11-12', notify_time: '23:00', timer_minutes: 120 })
    const logs: HabitLogRow[] = []
    let current = 0
    let best = 0
    let day = 0
    for (let d = '2024-11-12'; d < '2026-11-12'; d = addDays(d, 1), day++) {
      logs.push(done(d, { habit_id: 'other', id: `o-${d}` }))
      if (day % 50 === 49) {
        logs.push(done(d, { deleted_at: `${d}T13:00:00Z` }))
        current = 0
      } else if (d < '2026-11-11') {
        logs.push(done(d))
        best = Math.max(best, ++current)
      }
    }
    // 12:30 am on Nov 12: yesterday (Nov 11, nothing logged) is still open until 1 am, so it breaks nothing.
    expect(streaks(h, logs, at('2026-11-12T05:30:00Z'), NY)).toEqual({ current, best })
    expect(missedDaysToRecord(h, logs, at('2026-11-12T05:30:00Z'), NY)).toHaveLength(Math.floor(day / 50))
  })
})

describe('Spec §5 Habits: missed is not failure (Kept N of the last M)', () => {
  it('counts kept scheduled days; today counts only once it is kept', () => {
    const logs = [done('2026-11-01'), done('2026-11-02'), done('2026-11-03'), missed('2026-11-04'), done('2026-11-05')]
    const now = at('2026-11-06T15:00:00Z') // Nov 6, 10 am, still open
    expect(keptLately(habit(), logs, now, NY)).toEqual({ kept: 4, total: 5 })
    expect(keptLately(habit(), [...logs, done('2026-11-06')], now, NY)).toEqual({ kept: 5, total: 6 })
  })

  it('looks back 30 days only', () => {
    const logs = Array.from({ length: 40 }, (_, i) => done(addDays('2026-10-01', i))) // Oct 1 to Nov 9
    expect(keptLately(habit({ start_date: '2026-10-01' }), logs, at('2026-11-10T15:00:00Z'), NY)).toEqual({ kept: 29, total: 29 })
  })

  it('days the habit is not scheduled are left out', () => {
    const mondays = habit({ weekdays: [1] }) // Nov 2, 9, 16
    expect(keptLately(mondays, [done('2026-11-02'), done('2026-11-16')], at('2026-11-20T15:00:00Z'), NY)).toEqual({ kept: 2, total: 3 })
  })
})

describe('Spec §5 Habits: Pause all streaks', () => {
  const pause = (start_date: string, end_date: string | null = null): HabitPauseRow => ({ id: `p-${start_date}`, start_date, end_date, deleted_at: null })

  it('paused days neither extend nor break a streak, and are never logged as missed', () => {
    const logs = [done('2026-11-01'), done('2026-11-02')] // nothing Nov 3-5, paused
    const now = at('2026-11-07T01:00:00Z') // Nov 6, 8 pm
    const pauses = [pause('2026-11-03', '2026-11-05')]
    expect(streaks(habit(), [...logs, done('2026-11-06')], now, NY, pauses)).toEqual({ current: 3, best: 3 })
    expect(missedDaysToRecord(habit(), logs, now, NY, pauses)).toEqual([])
  })

  it('a habit checked off on a paused day still counts as kept, and can be checked off while paused', () => {
    const now = at('2026-11-04T15:00:00Z')
    const pauses = [pause('2026-11-03')]
    expect(streaks(habit(), [done('2026-11-02'), done('2026-11-03')], now, NY, pauses)).toEqual({ current: 2, best: 2 })
    expect(toggleAction(habit(), '2026-11-04', [], now, NY, pauses).kind).toBe('complete')
  })

  it('turning it on pauses from today (or reopens today’s pause); turning it off keeps today paused', () => {
    expect(pauseFrom([], '2026-11-10', 'u', () => 'new')).toMatchObject({ id: 'new', start_date: '2026-11-10', end_date: null })
    expect(pauseFrom([pause('2026-11-10', '2026-11-10')], '2026-11-10', 'u')).toMatchObject({ id: 'p-2026-11-10', end_date: null })
    expect(pauseFrom([pause('2026-11-01')], '2026-11-10', 'u')).toBeNull()
    expect(resumeAfter([pause('2026-11-01')], '2026-11-10')).toMatchObject({ end_date: '2026-11-10' })
    expect(resumeAfter([], '2026-11-10')).toBeNull()
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
