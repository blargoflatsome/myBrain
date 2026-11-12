import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dayLabel, dayTimeLabel, momentLabel, timeLabel } from '@/ui/dates'

const TODAY = '2026-11-10' // a Tuesday

describe('Spec §5 Dates and times: shown the same way everywhere', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T15:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('days show weekday, month and day, with the year only when it isn\'t this year', () => {
    expect(dayLabel('2026-11-12', TODAY)).toMatch(/Thu.*Nov.*12/)
    expect(dayLabel('2026-11-12', TODAY)).not.toMatch(/2026/)
    expect(dayLabel('2027-01-05', TODAY)).toMatch(/2027/)
  })

  it('times show the device\'s way, and a day with a time joins them with a dot', () => {
    expect(timeLabel('08:30:00')).toMatch(/8:30/)
    expect(dayTimeLabel('2026-11-12', '15:00', TODAY)).toMatch(/Nov.*12 · 3:00/)
    expect(dayTimeLabel('2026-11-12', null, TODAY)).not.toMatch(/·/)
  })

  it('a moment today shows just the time; an earlier one adds the day', () => {
    const now = new Date('2026-11-10T15:00:00')
    expect(momentLabel(new Date('2026-11-10T09:05:00').toISOString(), now)).not.toMatch(/Nov/)
    expect(momentLabel(new Date('2026-11-08T09:05:00').toISOString(), now)).toMatch(/Nov.*8 · 9:05/)
  })
})

