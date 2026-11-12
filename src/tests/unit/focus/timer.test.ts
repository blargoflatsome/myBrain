import { describe, expect, it } from 'vitest'
import { catchUp, clock, nextPart, pause, remainingMs, resume, skip, startFocus, LONG_MS, SHORT_MS, WORK_MS } from '@/focus/timer'

describe('Spec §5 Focus timer', () => {
  const t0 = Date.UTC(2026, 10, 10, 14, 0)

  it('25 minutes of work, 5-minute breaks, and every 4th break is 15 minutes', () => {
    expect(nextPart('work', 1)).toEqual({ phase: 'short', round: 1 })
    expect(nextPart('short', 1)).toEqual({ phase: 'work', round: 2 })
    expect(nextPart('work', 4)).toEqual({ phase: 'long', round: 4 })
    expect(nextPart('long', 4)).toEqual({ phase: 'work', round: 1 })
    expect(remainingMs(startFocus(t0), t0)).toBe(WORK_MS)
  })

  it('keeps time while away: parts that ended are passed, each next one starting when the last ended', () => {
    const away = catchUp(startFocus(t0), t0 + WORK_MS + SHORT_MS + 60_000)
    expect(away.ended).toBe(2)
    expect(away.state).toMatchObject({ phase: 'work', round: 2 })
    expect(remainingMs(away.state, t0 + WORK_MS + SHORT_MS + 60_000)).toBe(WORK_MS - 60_000)
    const full = catchUp(startFocus(t0), t0 + 4 * WORK_MS + 3 * SHORT_MS + 1)
    expect(full.state.phase).toBe('long')
    expect(remainingMs(full.state, t0 + 4 * WORK_MS + 3 * SHORT_MS + 1)).toBe(LONG_MS - 1)
  })

  it('pause keeps the time left; resume carries on; skip starts the next part in full', () => {
    const paused = pause(startFocus(t0), t0 + 60_000)
    expect(remainingMs(paused, t0 + 10 * 60_000)).toBe(WORK_MS - 60_000)
    expect(catchUp(paused, t0 + 99 * 60_000).ended).toBe(0)
    const resumed = resume(paused, t0 + 10 * 60_000)
    expect(remainingMs(resumed, t0 + 10 * 60_000)).toBe(WORK_MS - 60_000)
    const skipped = skip(startFocus(t0), t0 + 1000)
    expect(skipped).toMatchObject({ phase: 'short', round: 1 })
    expect(remainingMs(skipped, t0 + 1000)).toBe(SHORT_MS)
  })

  it('shows minutes and seconds', () => {
    expect(clock(WORK_MS)).toBe('25:00')
    expect(clock(61_500)).toBe('01:02')
    expect(clock(0)).toBe('00:00')
  })
})

