import { describe, expect, it } from 'vitest'
import { catchUp, remainingMs, startFocus, SHORT_MS, WORK_MS, type FocusState } from '@/focus/timer'
import { joinWave, minutesUntil, nextWave, offWave, syncToWave } from '@/focus/waves'

const at = (h: number, min: number, s = 0) => Date.UTC(2026, 10, 17, h, min, s)
describe('SPEC §5 Focus timer: waves on :00 and :30', () => {
  it('the next wave is the next :00 or :30, never now', () => {
    expect(nextWave(at(14, 26))).toBe(at(14, 30))
    expect(nextWave(at(14, 30))).toBe(at(15, 0))
    expect(minutesUntil(nextWave(at(14, 26, 1)), at(14, 26, 1))).toBe(4)
  })

  it('joining a wave waits, then starts round 1 of work on the wave', () => {
    const waiting = joinWave(at(14, 26))
    expect(waiting.phase).toBe('wait')
    const started = catchUp(waiting, at(14, 30, 1)).state
    expect(started).toMatchObject({ phase: 'work', round: 1, endsAt: at(14, 30) + WORK_MS })
  })

  it('a session started on the wave stays on it; one started off it is offered Sync', () => {
    expect(offWave(startFocus(at(14, 30)))).toBe(false)
    expect(offWave(startFocus(at(14, 37)))).toBe(true)
    expect(offWave(joinWave(at(14, 37)))).toBe(false)
  })

  it.each([
    ['trims work when the wave is nearer earlier', at(14, 33), at(15, 0)],
    ['stretches work when the wave is nearer later', at(14, 47), at(15, 30)],
  ])('Sync %s, so the next work part starts on a wave', (_, start, wave) => {
    const synced = syncToWave(startFocus(start), start + 60_000)
    // Round 1's break is a short one, so the next work part starts when it ends.
    expect(synced.endsAt! + SHORT_MS).toBe(wave)
    expect(offWave(synced)).toBe(false)
  })

  it('Sync on a break moves its end onto the wave, never into the past or the next minute', () => {
    const now = at(14, 59, 30)
    const brk: FocusState = { phase: 'short', round: 1, endsAt: at(15, 2), pausedMs: null }
    const synced = syncToWave(brk, now)
    expect(synced.endsAt).toBe(at(15, 30))
    expect(remainingMs(synced, now)).toBeGreaterThan(60_000)
  })

  it('Sync does nothing while paused', () => {
    const paused: FocusState = { phase: 'work', round: 1, endsAt: null, pausedMs: WORK_MS - SHORT_MS }
    expect(syncToWave(paused, at(14, 0))).toEqual(paused)
    expect(offWave(paused)).toBe(false)
  })
})
