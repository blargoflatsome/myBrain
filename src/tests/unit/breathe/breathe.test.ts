import { describe, expect, it } from 'vitest'
import { breathAt, leftMs, pauseBreathe, resumeBreathe, startBreathe, BREATHE_MS, CYCLE_MS, IN_MS } from '@/breathe/breathe'

describe('Spec §5 Breathe', () => {
  const t0 = Date.UTC(2026, 10, 15, 14, 0)

  it('runs 5 minutes, about 4 seconds in then 6 out, again and again', () => {
    const s = startBreathe(t0)
    expect(leftMs(s, t0)).toBe(BREATHE_MS)
    expect([0, IN_MS - 1, IN_MS, CYCLE_MS - 1, CYCLE_MS, CYCLE_MS + IN_MS].map((ms) => breathAt(s, t0 + ms))).toEqual(['in', 'in', 'out', 'out', 'in', 'out'])
    expect(leftMs(s, t0 + BREATHE_MS + 60_000)).toBe(0)
  })

  it('pause keeps the time left and the breath; resume carries on from there', () => {
    const paused = pauseBreathe(startBreathe(t0), t0 + IN_MS + 1000)
    expect(leftMs(paused, t0 + 10 * 60_000)).toBe(BREATHE_MS - IN_MS - 1000)
    expect(breathAt(paused, t0 + 10 * 60_000)).toBe('out')
    const later = t0 + 10 * 60_000
    const resumed = resumeBreathe(paused, later)
    expect(leftMs(resumed, later + CYCLE_MS - IN_MS - 1000)).toBe(BREATHE_MS - CYCLE_MS)
    expect(breathAt(resumed, later + CYCLE_MS - IN_MS - 1000)).toBe('in')
  })
})
