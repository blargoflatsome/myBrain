import { describe, expect, it } from 'vitest'
import type { JournalEntryRow } from '@/sync/types'
import { daysSinceWorstDay } from '@/dashboard/stats'

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

