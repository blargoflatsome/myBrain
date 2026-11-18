// SPEC §5 Focus timer, Waves: work parts start on :00 and :30, so people's sessions line up. Starting is never held
// back; joining a wave and syncing with one are offers. Waves are on the 30-minute grid of the clock everyone shares.
import { durationOf, nextPart, type FocusState } from '@/focus/timer'

export const WAVE_MS = 30 * 60_000
/** Close enough to count as on the wave. */
const ON_WAVE_MS = 30_000

/** The next wave strictly after now. */
export function nextWave(now: number): number {
  return (Math.floor(now / WAVE_MS) + 1) * WAVE_MS
}

/** Wait for the next wave, then start work (Join the :30 wave). */
export function joinWave(now: number): FocusState {
  return { phase: 'wait', round: 1, endsAt: nextWave(now), pausedMs: null }
}

/** When the next work part starts: after the break that follows, or when this break (or wait) ends. */
function nextWorkStart(state: FocusState & { endsAt: number }): number {
  if (state.phase !== 'work') return state.endsAt
  return state.endsAt + durationOf(nextPart(state.phase, state.round).phase)
}

/** Whether to offer Sync with the next wave: running (not paused or waiting) with the next work part off the wave. */
export function offWave(state: FocusState): boolean {
  if (state.endsAt === null || state.phase === 'wait') return false
  const offset = ((nextWorkStart({ ...state, endsAt: state.endsAt }) % WAVE_MS) + WAVE_MS) % WAVE_MS
  return Math.min(offset, WAVE_MS - offset) > ON_WAVE_MS
}

/**
 * Stretch or trim the current part so the next work part starts on a wave: the nearest one, unless that would end
 * this part within a minute from now (then the one after).
 */
export function syncToWave(state: FocusState, now: number): FocusState {
  if (state.endsAt === null || state.phase === 'wait') return state
  const target = nextWorkStart({ ...state, endsAt: state.endsAt })
  const gap = target - state.endsAt
  const earlier = Math.floor(target / WAVE_MS) * WAVE_MS
  const later = earlier + WAVE_MS
  const nearest = target - earlier <= later - target ? earlier : later
  const wave = nearest - gap > now + 60_000 ? nearest : later - gap > now + 60_000 ? later : later + WAVE_MS
  return { ...state, endsAt: wave - gap }
}

/** Minutes until a moment, rounded up, at least 1 ("in 4 min"). */
export function minutesUntil(at: number, now: number): number {
  return Math.max(1, Math.ceil((at - now) / 60_000))
}
