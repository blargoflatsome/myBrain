import { describe, expect, it } from 'vitest'
import { addMonths, monthGrid, parseDate } from '@/time/parseDate'

const TODAY = '2026-11-10' // a Tuesday

describe('Spec §5 Date fields: typing a day', () => {
  it.each([
    ['tomorrow', '2026-11-11'],
    ['today', '2026-11-10'],
    ['Fri', '2026-11-13'],
    ['next Friday', '2026-11-20'],
    ['Nov 20', '2026-11-20'],
    ['11/20', '2026-11-20'],
    ['2026-12-03', '2026-12-03'],
    ['in 3 days', '2026-11-13'],
    ['Tue, Nov 10', '2026-11-10'],
  ])('"%s" is %s', (typed, day) => {
    expect(parseDate(typed, TODAY)).toBe(day)
  })

  it('a day with no year means the next one coming, never the past', () => {
    expect(parseDate('Jan 5', TODAY)).toBe('2027-01-05')
  })

  it('what isn\'t a day (or an impossible date) gives nothing, so the box goes back to the saved day', () => {
    for (const t of ['', 'banana', 'may', '8pm', '2026-02-30']) expect(parseDate(t, TODAY)).toBeNull()
  })

  it('the month grid starts on Sunday and covers the whole month', () => {
    const weeks = monthGrid('2026-11-01')
    expect(weeks[0]![0]).toBe('2026-11-01') // Nov 1 2026 is a Sunday
    expect(weeks.flat()).toContain('2026-11-30')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(monthGrid('2026-12-01')[0]![0]).toBe('2026-11-29')
  })

  it('Page Up / Page Down keep the day inside a shorter month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2026-11-10', -1)).toBe('2026-10-10')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })
})

