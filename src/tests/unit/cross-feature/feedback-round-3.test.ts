import { describe, expect, it } from 'vitest'
import { catchUp, clock, nextPart, pause, remainingMs, resume, skip, startFocus, LONG_MS, SHORT_MS, WORK_MS } from '@/focus/timer'
import { isScheduled, onMonthDay } from '@/habits/rules'
import { nextWholeHour } from '@/events/rules'
import type { HabitRow } from '@/sync/types'

const habit = (extra: Partial<HabitRow>): HabitRow => ({
  id: 'h',
  user_id: 'u',
  title: 'x',
  notify_time: '15:00',
  timer_minutes: null,
  weekdays: [4],
  start_date: '2026-11-12',
  is_private: false,
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

describe('Spec §5 Calendar: a new event starts at a time', () => {
  it('the next whole hour, 23:00 at the latest', () => {
    expect(nextWholeHour(new Date(2026, 10, 10, 9, 20))).toBe('10:00')
    expect(nextWholeHour(new Date(2026, 10, 10, 23, 30))).toBe('23:00')
  })
})

describe('Spec §5 Focus timer', () => {
  const t0 = Date.UTC(2026, 10, 10, 14, 0)

  it('25 minutes of work, 5-minute breaks, and every 4th break is 15 minutes', () => {
    expect(nextPart('work', 1)).toEqual({ phase: 'short', round: 1 })
    expect(nextPart('short', 1)).toEqual({ phase: 'work', round: 2 })
    expect(nextPart('work', 4)).toEqual({ phase: 'long', round: 4 })
    expect(nextPart('long', 4)).toEqual({ phase: 'work', round: 1 })
    expect(remainingMs(startFocus(t0), t0)).toBe(WORK_MS)
  })

  it('keeps time while away: parts that ended are passed, each next one starting when the last ended', () => {
    const away = catchUp(startFocus(t0), t0 + WORK_MS + SHORT_MS + 60_000)
    expect(away.ended).toBe(2)
    expect(away.state).toMatchObject({ phase: 'work', round: 2 })
    expect(remainingMs(away.state, t0 + WORK_MS + SHORT_MS + 60_000)).toBe(WORK_MS - 60_000)
    const full = catchUp(startFocus(t0), t0 + 4 * WORK_MS + 3 * SHORT_MS + 1)
    expect(full.state.phase).toBe('long')
    expect(remainingMs(full.state, t0 + 4 * WORK_MS + 3 * SHORT_MS + 1)).toBe(LONG_MS - 1)
  })

  it('pause keeps the time left; resume carries on; skip starts the next part in full', () => {
    const paused = pause(startFocus(t0), t0 + 60_000)
    expect(remainingMs(paused, t0 + 10 * 60_000)).toBe(WORK_MS - 60_000)
    expect(catchUp(paused, t0 + 99 * 60_000).ended).toBe(0)
    const resumed = resume(paused, t0 + 10 * 60_000)
    expect(remainingMs(resumed, t0 + 10 * 60_000)).toBe(WORK_MS - 60_000)
    const skipped = skip(startFocus(t0), t0 + 1000)
    expect(skipped).toMatchObject({ phase: 'short', round: 1 })
    expect(remainingMs(skipped, t0 + 1000)).toBe(SHORT_MS)
  })

  it('shows minutes and seconds', () => {
    expect(clock(WORK_MS)).toBe('25:00')
    expect(clock(61_500)).toBe('01:02')
    expect(clock(0)).toBe('00:00')
  })
})
