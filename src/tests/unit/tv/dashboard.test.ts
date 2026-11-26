import { afterEach, describe, expect, it } from 'vitest'
import type { EventInviteRow, EventRow, HabitLogRow, HabitRow, TaskRow } from '@/sync/types'
import { addMonths, monthItems, monthRange, monthWeeks, pageOf, yourDay, type CalendarData, type DayData } from '@/tv/screen/dashboard'
import { nextFocus, type Box } from '@/tv/screen/spatial'
import { snapshotLoader, type SnapshotAnswer } from '@/tv/screen/snapshot'
import { useServerAdapter } from '@/server/server'

const TZ = 'America/New_York'
const TODAY = '2026-11-26'
const task = (id: string, extra: Partial<TaskRow> = {}): TaskRow => ({ id, title: id, due_date: TODAY, status: 'open', priority: 1, source: 'manual', deleted_at: null, ...extra })
const event = (id: string, extra: Partial<EventRow> = {}): EventRow => ({
  id, title: id, user_id: 'me', start_date: TODAY, end_date: TODAY, start_time: '09:00', end_time: '10:00', repeat: 'never', reminder_minutes: null, deleted_at: null, ...extra,
})
const invite = (eventId: string, response: EventInviteRow['response']): EventInviteRow => ({ id: `i-${eventId}`, event_id: eventId, response, deleted_at: null })
const data = (extra: Partial<CalendarData>): CalendarData => ({ tasks: [], events: [], invites: [], me: 'me', ...extra })

describe('SPEC §9 Moving through months: the weeks shown', () => {
  it.each([
    ['November 2026 starts on a Sunday', '2026-11-01', '2026-11-01', '2026-12-05', 5],
    ['February 2026 fits four weeks exactly', '2026-02-01', '2026-02-01', '2026-02-28', 4],
    ['May 2026 needs six weeks', '2026-05-01', '2026-04-26', '2026-06-06', 6],
  ])('%s', (_what, month, from, to, weeks) => {
    expect(monthRange(month)).toEqual({ from, to })
    expect(monthWeeks(month)).toHaveLength(weeks)
  })

  it.each([
    ['2026-11-01', 1, '2026-12-01'],
    ['2026-12-01', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-01'],
    ['2026-03-01', -14, '2025-01-01'],
  ])('%s moved by %i is %s', (month, by, next) => {
    expect(addMonths(month, by)).toBe(next)
  })
})

describe('SPEC §9 Monthly calendar: each day shows its events, then its tasks', () => {
  const { from, to } = monthRange('2026-11-01')

  it('events first (all day, then by time), then tasks; done tasks and unanswered invitations are marked', () => {
    const items = monthItems(
      data({
        tasks: [task('Stamps', { status: 'done', completed_at: `${TODAY}T15:00:00Z` }), task('Rent')],
        events: [event('Lunch', { start_time: '12:00', end_time: '13:00' }), event('Holiday', { start_time: null, end_time: null }), event('Party', { user_id: 'sam', start_time: '08:00' })],
        invites: [invite('Party', 'pending')],
      }),
      from,
      to,
    )[TODAY]!
    expect(items.map((i) => i.title)).toEqual(['Holiday', 'Party', 'Lunch', 'Stamps', 'Rent'])
    expect(items.find((i) => i.title === 'Party')).toMatchObject({ pending: true, time: '08:00' })
    expect(items.find((i) => i.title === 'Stamps')).toMatchObject({ done: true })
  })

  it('an event lasting several days shows on each of them, and nothing outside the shown weeks', () => {
    const items = monthItems(data({ events: [event('Trip', { start_date: '2026-12-04', end_date: '2026-12-07', start_time: null, end_time: null })] }), from, to)
    expect(Object.keys(items).sort()).toEqual(['2026-12-04', '2026-12-05'])
  })
})

describe('SPEC §9 Your Day: what’s left of today, titles only: events, then tasks, then habits', () => {
  // 2:30 pm in New York on TODAY (a Thursday).
  const NOW = new Date('2026-11-26T19:30:00Z')
  const habit = (id: string, extra: Partial<HabitRow> = {}): HabitRow => ({
    id, title: id, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', created_at: `2026-11-01T00:00:00Z`, deleted_at: null, ...extra,
  })
  const done = (habitId: string): HabitLogRow => ({ id: `l-${habitId}`, habit_id: habitId, date: TODAY, status: 'completed', completed_at: `${TODAY}T12:00:00Z`, deleted_at: null })
  const day = (extra: Partial<DayData>) => yourDay({ ...data({}), habits: [], habitLogs: [], habitPauses: [], ...extra }, TODAY, NOW, TZ)

  it('my events and Yes ones not yet over in time order, then open tasks (carried over too), then habits not done', () => {
    const { rows } = day({
      events: [
        event('Late', { start_time: '18:00', end_time: '19:00' }),
        event('Over', { start_time: '07:00', end_time: '08:00' }),
        event('Now', { start_time: '14:00', end_time: '15:00' }),
        event('Said yes', { user_id: 'sam', start_time: '16:00', end_time: '17:00' }),
        event('Said maybe', { user_id: 'sam', start_time: '16:00', end_time: '17:00' }),
        event('Cancelled', { cancelled_at: `${TODAY}T01:00:00Z`, start_time: '18:00', end_time: '19:00' }),
        event('Long', { start_date: '2026-11-25', end_date: '2026-11-27', start_time: null, end_time: null }),
      ],
      invites: [invite('Said yes', 'yes'), invite('Said maybe', 'maybe')],
      tasks: [task('Done', { status: 'done', completed_at: `${TODAY}T15:00:00Z` }), task('Old', { due_date: '2026-11-20' }), task('Tomorrow', { due_date: '2026-11-27' })],
      habits: [habit('Walk'), habit('Stretched', { created_at: '2026-10-01T00:00:00Z' }), habit('Weekends', { weekdays: [0, 6] }), habit('Read', { created_at: '2026-11-02T00:00:00Z' })],
      habitLogs: [done('Stretched')],
    })
    expect(rows).toEqual([
      { kind: 'event', id: 'Long', title: 'Long' },
      { kind: 'event', id: 'Now', title: 'Now' },
      { kind: 'event', id: 'Said yes', title: 'Said yes' },
      { kind: 'event', id: 'Late', title: 'Late' },
      { kind: 'task', id: 'Old', title: 'Old' },
      { kind: 'habit', id: 'Walk', title: 'Walk' },
      { kind: 'habit', id: 'Read', title: 'Read' },
    ])
  })

  it.each([
    ['ended at its end time', { start_time: '13:00', end_time: '14:30' }, false],
    ['still on until its end time', { start_time: '13:00', end_time: '14:31' }, true],
    ['with no end time, gone once it starts', { start_time: '14:00', end_time: null }, false],
    ['all day, there until midnight', { start_time: null, end_time: null }, true],
    ['began yesterday and ends tomorrow', { start_date: '2026-11-25', end_date: '2026-11-27', start_time: '09:00', end_time: '10:00' }, true],
    ['began yesterday and ended this morning', { start_date: '2026-11-25', end_date: TODAY, start_time: '20:00', end_time: '09:00' }, false],
  ])('an event %s', (_what, extra, shown) => {
    expect(day({ events: [event('Trip', extra as Partial<EventRow>)] }).rows.length).toBe(shown ? 1 : 0)
  })

  it.each([
    ['a paused habit is left out', { habitPauses: [{ id: 'p', start_date: '2026-11-20', end_date: null, deleted_at: null }] }],
    ['a habit past its timer is left out', { habits: [habit('Walk', { notify_time: '08:00', timer_minutes: 30 })] }],
  ])('%s', (_what, extra) => {
    expect(day({ habits: [habit('Walk')], ...extra }).rows).toEqual([])
  })

  it.each([
    ['everything planned is done: all done', { tasks: [task('Done', { status: 'done', completed_at: `${TODAY}T15:00:00Z` })], habits: [habit('Walk')], habitLogs: [done('Walk')] }, true],
    ['only an event that has ended: all done', { events: [event('Over', { start_time: '07:00', end_time: '08:00' })] }, true],
    ['nothing planned at all: not all done', {}, false],
    ['something left: not all done', { tasks: [task('Open')] }, false],
  ])('%s', (_what, extra, allDone) => {
    expect(day(extra as Partial<DayData>).allDone).toBe(allDone)
  })

  it.each([
    ['the first page', 15, 0, 7, 0, 3],
    ['the last page has what is left', 15, 2, 1, 2, 3],
    ['a page past the end stays on the last (rows went away)', 8, 5, 1, 1, 2],
    ['nothing at all is one empty page', 0, 0, 0, 0, 1],
  ])('pages: %s', (_what, count, asked, shown, page, pages) => {
    const result = pageOf(Array.from({ length: count }, (_, i) => i), asked, 7)
    expect({ shown: result.rows.length, page: result.page, pages: result.pages }).toEqual({ shown, page, pages })
  })
})

describe('SPEC §9 Remote control: an arrow moves focus to the nearest control that way', () => {
  const box = (left: number, top: number): Box => ({ left, top, width: 40, height: 40 })
  // ‹ November › This month along the top; Your Day's ‹ › lower down on the right.
  const controls = [box(0, 0), box(300, 0), box(400, 0), box(900, 600), box(1100, 600)]
  it.each([
    ['right from ‹ goes to ›', 0, 'right', 1],
    ['right from › goes to This month', 1, 'right', 2],
    ['down from This month goes to the nearer pager button', 2, 'down', 3],
    ['up from the pager goes back to the top row', 3, 'up', 2],
    ['left from ‹ goes nowhere', 0, 'left', -1],
  ] as const)('%s', (_what, from, arrow, to) => {
    expect(nextFocus(controls[from]!, controls, arrow)).toBe(to)
  })
})

describe('SPEC §9 What it reads: habit logs come in full once, then only the changes', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('keeps the logs between calls, drops deleted ones, and asks from just before the last answer', async () => {
    const log = (id: string, extra: Partial<HabitLogRow> = {}): HabitLogRow => ({ id, habit_id: 'h', date: TODAY, status: 'completed', completed_at: null, deleted_at: null, ...extra })
    const answers: Partial<SnapshotAnswer>[] = [
      { now: '2026-11-26T12:00:00Z', habit_logs: [log('a'), log('b')] },
      { now: '2026-11-26T12:00:30Z', habit_logs: [log('b', { deleted_at: '2026-11-26T12:00:10Z' }), log('c')] },
    ]
    const asked: Record<string, unknown>[] = []
    restore = useServerAdapter({
      online: () => true,
      call: async (_fn, args) => {
        asked.push(args)
        const base: SnapshotAnswer = { me: 'me', now: '', tasks: [], events: [], invites: [], habits: [], habit_logs: [], habit_pauses: [], routines: [], routine_runs: [], routine_steps: [], routine_step_logs: [], orphans: 0, wrote_today: false, journal_time: null }
        return { ...base, ...answers.shift() }
      },
    })
    const loader = snapshotLoader(() => 'key')
    await loader.load('2026-11-01', '2026-12-05', TODAY)
    const second = await loader.load('2026-11-01', '2026-12-05', TODAY)
    expect(second.facts.habitLogs.map((l) => l.id).sort()).toEqual(['a', 'c'])
    expect(asked.map((a) => a.logs_since)).toEqual([null, '2026-11-26T11:59:00.000Z'])
  })
})
