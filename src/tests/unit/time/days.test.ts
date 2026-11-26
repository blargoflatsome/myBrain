import { describe, expect, it } from 'vitest'
import { clockIn, hourOf, localMoment, weekdayOf } from '@/time/days'
import { momentLabel } from '@/ui/dates'

const NY = 'America/New_York' // behind UTC; clocks went back at 2 am on 2026-11-01
const AUCKLAND = 'Pacific/Auckland' // ahead of UTC (+13 in November)
const at = (iso: string) => new Date(iso).getTime()

describe('SPEC §5 Tasks: the day and the clock are read in my time zone', () => {
  it.each([
    { what: 'before the clocks go back', iso: '2026-11-01T05:30:00Z', zone: NY, clock: '01:30' },
    { what: 'after the clocks go back, the same hour again', iso: '2026-11-01T06:30:00Z', zone: NY, clock: '01:30' },
    { what: 'midnight', iso: '2026-11-10T05:00:00Z', zone: NY, clock: '00:00' },
    { what: 'a zone ahead of UTC, already tomorrow', iso: '2026-11-10T12:00:00Z', zone: AUCKLAND, clock: '01:00' },
  ])('clock time: $what', ({ iso, zone, clock }) => {
    expect(clockIn(at(iso), zone)).toBe(clock)
  })

  it('a moment late in the evening behind UTC falls on that evening, not the UTC day', () => {
    expect(localMoment('2026-11-10T04:30:00Z', NY)).toEqual({ date: '2026-11-09', hour: 23, minute: 30 })
    expect(localMoment('2026-11-10T12:00:00Z', AUCKLAND)).toEqual({ date: '2026-11-11', hour: 1, minute: 0 })
  })

  it.each([
    { date: '2026-11-08', weekday: 0 },
    { date: '2026-11-10', weekday: 2 },
    { date: '2026-11-14', weekday: 6 },
    { date: '2024-02-29', weekday: 4 },
  ])('$date is weekday $weekday, whatever the zone', ({ date, weekday }) => {
    expect(weekdayOf(date)).toBe(weekday)
  })

  it('when something happened is shown on my day: today needs no day, last night does', () => {
    const now = new Date('2026-11-10T12:00:00Z')
    const lastNightInNY = '2026-11-10T03:00:00Z'
    expect(momentLabel(lastNightInNY, now, 'UTC')).not.toMatch(/Nov/)
    expect(momentLabel(lastNightInNY, now, NY)).toMatch(/Nov.*9 · 10:00/)
  })
})

describe('SPEC §9 TV app: clock times read right on the older engine of the TV', () => {
  const parts = (hour: string, dayPeriod?: string) =>
    [{ type: 'hour', value: hour }, { type: 'literal', value: ':' }, { type: 'minute', value: '05' }, ...(dayPeriod ? [{ type: 'dayPeriod', value: dayPeriod }] : [])] as Intl.DateTimeFormatPart[]

  it('an engine that ignores the 24-hour setting answers in 12-hour time, and the hour still reads 24-hour', () => {
    expect(hourOf(parts('1', 'PM'))).toBe(13)
    expect(hourOf(parts('12', 'AM'))).toBe(0)
    expect(hourOf(parts('12', 'PM'))).toBe(12)
    expect(hourOf(parts('9', 'AM'))).toBe(9)
  })

  it('a 24-hour answer is kept, with midnight written as 24 read as 0', () => {
    expect(hourOf(parts('13'))).toBe(13)
    expect(hourOf(parts('24'))).toBe(0)
  })
})
