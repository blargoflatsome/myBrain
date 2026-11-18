import { describe, expect, it } from 'vitest'
import { isLater } from '@/reminders/priority'

describe('Spec §5 High-priority tasks: a reminder is always later than now', () => {
  it('on today, or a day that carried over to today, the time must still be to come; a later day is always fine', () => {
    expect(isLater('2026-11-10', '09:21', '2026-11-10', '09:20')).toBe(true)
    expect(isLater('2026-11-10', '09:20', '2026-11-10', '09:20')).toBe(false)
    expect(isLater('2026-11-09', '08:00', '2026-11-10', '09:20')).toBe(false)
    expect(isLater('2026-11-09', '23:00', '2026-11-10', '09:20')).toBe(true)
    expect(isLater('2026-11-11', '00:00', '2026-11-10', '09:20')).toBe(true)
  })
})
