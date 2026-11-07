import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow, JournalEntryRow, VaultBucketRow, VaultItemRow } from '@/sync/types'
import { onWeek } from '@/tasks/days'
import { isScheduled, streaks } from '@/habits/rules'
import { occursOn } from '@/events/rules'
import { isTaskScheduled } from '@/reminders/priority'
import { buildCaptureRecord } from '@/capture/capture'
import { daysSinceWorstDay, favoriteBuckets, yesterdaySummary } from '@/dashboard/stats'
import { icsFile } from '@/events/ics'

const habit = (extra: Partial<HabitRow> = {}): HabitRow => ({
  id: 'h1',
  title: 'Water plants',
  notify_time: null,
  timer_minutes: null,
  weekdays: [2],
  start_date: '2026-11-03', // a Tuesday
  is_private: false,
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

describe('Spec §5 Quick capture: habits', () => {
  it('a captured habit uses the full habit form', () => {
    const r = buildCaptureRecord(
      { destination: 'habit', text: ' Stretch ', habit: { weekdays: [1, 3, 5], weekInterval: 2, notifyTime: '07:30', timerMinutes: 30, isPrivate: true, isPriority: true } },
      'u1',
      () => 'id1',
    )
    expect(r.table).toBe('habits')
    expect(r.row).toMatchObject({ id: 'id1', title: 'Stretch', weekdays: [1, 3, 5], week_interval: 2, notify_time: '07:30', timer_minutes: 30, is_private: true, is_priority: true })
  })
  it('a timer needs a reminder time', () => {
    const r = buildCaptureRecord({ destination: 'habit', text: 'Read', habit: { weekdays: [0, 1, 2, 3, 4, 5, 6], weekInterval: 1, notifyTime: null, timerMinutes: 30, isPrivate: false, isPriority: false } }, 'u1')
    expect(r.row).toMatchObject({ timer_minutes: null })
  })
})

describe('Spec §5 Dashboard: days since your worst day', () => {
  const entry = (date: string, better: boolean | null): JournalEntryRow => ({ id: date, date, body: '', stats: {}, stats_final: true, auto: false, better_than_yesterday: better, deleted_at: null })
  it('counts days in a row answered Yes up to today; a No or a missing answer resets it', () => {
    expect(daysSinceWorstDay([entry('2026-11-07', true), entry('2026-11-08', true), entry('2026-11-09', true), entry('2026-11-10', true)], '2026-11-10')).toBe(4)
    expect(daysSinceWorstDay([entry('2026-11-07', true), entry('2026-11-08', false), entry('2026-11-09', true), entry('2026-11-10', true)], '2026-11-10')).toBe(2)
    expect(daysSinceWorstDay([entry('2026-11-07', true), entry('2026-11-09', true), entry('2026-11-10', true)], '2026-11-10')).toBe(2)
  })
  it('today without an answer yet does not break it', () => {
    expect(daysSinceWorstDay([entry('2026-11-08', true), entry('2026-11-09', true)], '2026-11-10')).toBe(2)
    expect(daysSinceWorstDay([entry('2026-11-08', true), entry('2026-11-09', true), entry('2026-11-10', null)], '2026-11-10')).toBe(2)
  })
})

describe('Spec §5 The Vault: favorite buckets on the Dashboard', () => {
  it('each starred bucket, in order, with its 3 newest items', () => {
    const buckets: VaultBucketRow[] = [
      { id: 'b2', name: 'Books', position: 1, starred: true, deleted_at: null },
      { id: 'b1', name: 'Shopping', position: 0, starred: true, deleted_at: null },
      { id: 'b3', name: 'Ideas', position: 2, starred: false, deleted_at: null },
    ]
    const items: VaultItemRow[] = ['a', 'b', 'c', 'd'].map((t, i) => ({ id: t, bucket_id: 'b2', title: t, created_at: `2026-11-0${i + 1}`, deleted_at: null }))
    const out = favoriteBuckets(buckets, items)
    expect(out.map((f) => f.bucket.name)).toEqual(['Shopping', 'Books'])
    expect(out[1]!.newest.map((i) => i.title)).toEqual(['d', 'c', 'b'])
  })
})

describe('Spec §5 Dashboard: How past you did yesterday', () => {
  it('counts habits, tasks and routines finished (every step done), and lists each routine', () => {
    const y = yesterdaySummary({
      tasks: { done: 2, due: 5 },
      habits: { kept: 3, scheduled: 4 },
      routines: [
        { id: 'r1', title: 'Morning', done: 5, total: 5 },
        { id: 'r2', title: 'Night', done: 1, total: 3 },
        { id: 'r3', title: 'Empty', done: 0, total: 0 },
      ],
      priority: [],
      streaks: [],
      quests: [],
    })
    expect(y.habits).toEqual({ kept: 3, scheduled: 4 })
    expect(y.tasks).toEqual({ done: 2, due: 5 })
    expect(y.routines.finished).toBe(1)
    expect(y.routines.total).toBe(2)
    expect(y.routines.list.map((r) => r.title)).toEqual(['Morning', 'Night'])
    expect(y.empty).toBe(false)
  })

  it('is empty when nothing was scheduled or due', () => {
    expect(yesterdaySummary({ tasks: { done: 0, due: 0 }, habits: { kept: 0, scheduled: 0 }, routines: [], priority: [], streaks: [], quests: [] }).empty).toBe(true)
  })
})
