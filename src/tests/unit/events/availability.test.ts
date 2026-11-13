import { describe, expect, it } from 'vitest'
import { findTimes, myUnavailable, personTimes, statusAt, type FreeBusyRow } from '@/events/availability'
import { zonedTime } from '@/habits/rules'

const TZ = 'America/New_York'
const row = (extra: Partial<FreeBusyRow>): FreeBusyRow => ({
  user_id: 'bob', timezone: TZ, kind: 'rule', weekday: null, start_date: null, start_time: null, end_date: null, end_time: null, repeat: null, busy: true, level: 'busy',
  ...extra,
})
const shares = (user_id: string) => row({ user_id, kind: 'shares', busy: false, level: null })
const at = (date: string, time: string) => zonedTime(date, time, TZ)
const slot = (date: string, from: string, until: string) => ({ start: at(date, from), end: at(date, until) })
const iso = (ms: number) => new Date(ms).toISOString()

describe('SPEC §10 Scheduler: free, busy, maybe busy and unknown', () => {
  it('weekly times, one-off days and busy events make someone busy; Maybe is tentative; an event without times blocks the day', () => {
    const t = personTimes(
      [
        shares('bob'),
        row({ kind: 'rule', weekday: 2, start_time: '09:00:00', end_time: '17:00:00' }), // Tuesdays 9-5
        row({ kind: 'exception', start_date: '2026-11-12', busy: true }), // away all day Thursday
        row({ kind: 'event', start_date: '2026-11-11', start_time: '18:00:00', end_date: '2026-11-11', end_time: '19:00:00', repeat: 'never' }),
        row({ kind: 'event', start_date: '2026-11-11', start_time: '20:00:00', end_date: '2026-11-11', end_time: '21:00:00', repeat: 'never', level: 'tentative' }),
        row({ kind: 'event', start_date: '2026-11-13', start_time: null, end_date: '2026-11-13', end_time: null, repeat: 'never' }), // all day, shown as Busy
      ],
      '2026-11-10',
      '2026-11-13',
    ).get('bob')
    expect(statusAt(t, slot('2026-11-10', '10:00', '11:00'))).toBe('busy')
    expect(statusAt(t, slot('2026-11-10', '17:00', '18:00'))).toBe('free')
    expect(statusAt(t, slot('2026-11-11', '18:30', '19:30'))).toBe('busy')
    expect(statusAt(t, slot('2026-11-11', '20:00', '20:30'))).toBe('tentative')
    expect(statusAt(t, slot('2026-11-12', '12:00', '13:00'))).toBe('busy')
    expect(statusAt(t, slot('2026-11-13', '12:00', '13:00'))).toBe('busy')
  })

  it('an "available after all" day frees up time that is normally unavailable', () => {
    const t = personTimes(
      [shares('bob'), row({ kind: 'rule', weekday: 2, start_time: '09:00:00', end_time: '17:00:00' }), row({ kind: 'exception', start_date: '2026-11-10', start_time: '12:00:00', end_time: '14:00:00', busy: false })],
      '2026-11-10',
      '2026-11-10',
    ).get('bob')
    expect(statusAt(t, slot('2026-11-10', '12:30', '13:30'))).toBe('free')
    expect(statusAt(t, slot('2026-11-10', '10:00', '11:00'))).toBe('busy')
  })

  it("someone whose times I can't see is unknown, never free", () => {
    const times = personTimes([shares('bob')], '2026-11-10', '2026-11-10')
    expect(statusAt(times.get('carol'), slot('2026-11-10', '10:00', '11:00'))).toBe('unknown')
    expect(statusAt(times.get('bob'), slot('2026-11-10', '10:00', '11:00'))).toBe('free')
  })
})

describe('SPEC §10 Scheduler: Find a time', () => {
  const now = new Date(at('2026-11-10', '07:00'))
  const hour = 60 * 60_000

  it('Good times first, from the day I picked (not today), on the half hour from 8 am, never overlapping', () => {
    const times = personTimes([shares('bob')], '2026-11-10', '2026-12-04')
    const found = findTimes([{ id: 'bob', optional: false }], times, hour, '2026-11-20', now, TZ)
    expect(found.map((s) => iso(s.start))).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00'].map((t) => iso(at('2026-11-20', t))))
    expect(found.every((s) => s.rating === 'good')).toBe(true)
  })

  it('a day picked in the past starts from now', () => {
    const times = personTimes([shares('bob')], '2026-11-01', '2026-11-30')
    const found = findTimes([{ id: 'bob', optional: false }], times, hour, '2026-11-01', new Date(at('2026-11-10', '13:10')), TZ)
    expect(iso(found[0]!.start)).toBe(iso(at('2026-11-10', '13:30')))
  })

  it('Fair times (someone tentative, or an optional person busy) come before Poor ones, and say who can’t make it', () => {
    const rows = [
      shares('bob'), shares('alex'), shares('sam'),
      row({ user_id: 'bob', kind: 'exception', start_date: '2026-11-20', busy: true }), // required, away all Friday
      row({ user_id: 'alex', kind: 'event', start_date: '2026-11-21', start_time: '08:00:00', end_date: '2026-11-21', end_time: '21:00:00', repeat: 'never' }), // optional, busy Saturday
      row({ user_id: 'sam', kind: 'event', start_date: '2026-11-21', start_time: '08:00:00', end_date: '2026-11-21', end_time: '21:00:00', repeat: 'never', level: 'tentative' }),
    ]
    const people = [{ id: 'bob', optional: false }, { id: 'alex', optional: true }, { id: 'sam', optional: false }]
    const times = personTimes(rows, '2026-11-20', '2026-11-21')
    const found = findTimes(people, times, hour, '2026-11-20', now, TZ, { days: 2 })
    expect(found[0]).toMatchObject({ rating: 'fair', cantMake: ['alex', 'sam'] })
    expect(iso(found[0]!.start)).toBe(iso(at('2026-11-21', '08:00')))
    const fridayOnly = findTimes(people, times, hour, '2026-11-20', now, TZ, { days: 1 })
    expect(fridayOnly[0]).toMatchObject({ rating: 'poor', cantMake: ['bob'] })
  })

  it('unknown people don’t count against a time', () => {
    const times = personTimes([shares('bob')], '2026-11-20', '2026-11-20')
    const found = findTimes([{ id: 'bob', optional: false }, { id: 'carol', optional: false }], times, hour, '2026-11-20', now, TZ, { days: 1 })
    expect(found[0]).toMatchObject({ rating: 'good', cantMake: [] })
  })
})

describe('SPEC §10 Scheduler: my not-available times on my Calendar', () => {
  it('weekly times and unavailable days are shaded, minus "available after all", overlaps drawn as one', () => {
    const rules = [
      { weekday: 2, start_time: '09:00:00', end_time: '17:00:00', deleted_at: null }, // Tuesdays 9-5
      { weekday: 2, start_time: '16:00:00', end_time: '18:00:00', deleted_at: null }, // overlaps the end
      { weekday: 3, start_time: '09:00:00', end_time: '17:00:00', deleted_at: '2026-11-01T00:00:00Z' }, // removed
    ]
    const exceptions = [
      { date: '2026-11-10', start_time: '12:00:00', end_time: '13:00:00', kind: 'available' as const, deleted_at: null },
      { date: '2026-11-12', start_time: null, end_time: null, kind: 'unavailable' as const, deleted_at: null },
    ]
    expect(myUnavailable(rules, exceptions, '2026-11-10', '2026-11-12')).toEqual([
      { start: '2026-11-10T09:00', end: '2026-11-10T12:00' },
      { start: '2026-11-10T13:00', end: '2026-11-10T18:00' },
      { start: '2026-11-12T00:00', end: '2026-11-13T00:00' },
    ])
  })
})
