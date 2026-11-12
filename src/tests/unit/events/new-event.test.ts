import { describe, expect, it } from 'vitest'
import { nextWholeHour } from '@/events/rules'

describe('Spec §5 Calendar: a new event starts at a time', () => {
  it('the next whole hour, 23:00 at the latest', () => {
    expect(nextWholeHour(new Date(2026, 10, 10, 9, 20))).toBe('10:00')
    expect(nextWholeHour(new Date(2026, 10, 10, 23, 30))).toBe('23:00')
  })
})

