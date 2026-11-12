import { describe, expect, it } from 'vitest'

describe('Spec §5 Priority tasks: always in the future', () => {
  it('a repeating one starts today if its time is still to come, otherwise tomorrow', async () => {
    const { firstFutureDay } = await import('@/reminders/priority')
    expect(firstFutureDay('15:00', '2026-11-10', '09:20')).toBe('2026-11-10')
    expect(firstFutureDay('09:20', '2026-11-10', '09:20')).toBe('2026-11-11')
    expect(firstFutureDay('08:00:00', '2026-11-10', '09:20')).toBe('2026-11-11')
  })
  it('a one-off must be later than now', async () => {
    const { isLater } = await import('@/reminders/priority')
    expect(isLater('2026-11-10', '09:21', '2026-11-10', '09:20')).toBe(true)
    expect(isLater('2026-11-10', '09:20', '2026-11-10', '09:20')).toBe(false)
    expect(isLater('2026-11-09', '23:00', '2026-11-10', '09:20')).toBe(false)
    expect(isLater('2026-11-11', '00:00', '2026-11-10', '09:20')).toBe(true)
  })
})

