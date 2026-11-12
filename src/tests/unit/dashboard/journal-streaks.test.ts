import { describe, expect, it } from 'vitest'
import type { JournalEntryRow } from '@/sync/types'
import { journalStreaks } from '@/dashboard/stats'

const TODAY = '2026-11-10'

describe('SPEC §5 Trophies: journal streaks', () => {
  const entry = (date: string, body = '<p>x</p>'): JournalEntryRow => ({ id: date, date, body, stats: {}, stats_final: true, auto: !body, deleted_at: null })

  it('counts days in a row with an entry I wrote; entries the app wrote do not count', () => {
    const entries = [entry('2026-11-01'), entry('2026-11-02'), entry('2026-11-03'), entry('2026-11-04', ''), entry('2026-11-08'), entry('2026-11-09')]
    expect(journalStreaks(entries, TODAY)).toEqual({ current: 2, best: 3 })
  })
  it('the current streak is still alive today until the day ends', () => {
    expect(journalStreaks([entry('2026-11-09'), entry('2026-11-10')], TODAY).current).toBe(2)
    expect(journalStreaks([entry('2026-11-08')], TODAY).current).toBe(0)
  })
})
