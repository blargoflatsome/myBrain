// SPEC §5 Breathe: a 5-minute timer with a breathing guide. Like the Focus timer it is worked out from times, not a
// ticking counter, so it keeps time if the screen sleeps for a moment.

export const BREATHE_MS = 5 * 60_000
/** One breath: about 4 seconds in, 6 seconds out. The ring's animation in style.css uses the same lengths. */
export const IN_MS = 4_000
export const OUT_MS = 6_000
export const CYCLE_MS = IN_MS + OUT_MS

export type Breath = 'in' | 'out'

export interface BreatheState {
  /** When the 5 minutes are up (ms since 1970), while running. */
  endsAt: number | null
  /** Time left when paused. */
  pausedMs: number | null
}

export function startBreathe(now: number): BreatheState {
  return { endsAt: now + BREATHE_MS, pausedMs: null }
}

export function leftMs(state: BreatheState, now: number): number {
  return Math.max(0, state.pausedMs ?? (state.endsAt ?? now) - now)
}

/** Breathing in or out, from how long Breathe has been going. */
export function breathAt(state: BreatheState, now: number): Breath {
  const elapsed = BREATHE_MS - leftMs(state, now)
  return elapsed % CYCLE_MS < IN_MS ? 'in' : 'out'
}

export function pauseBreathe(state: BreatheState, now: number): BreatheState {
  return state.pausedMs === null ? { endsAt: null, pausedMs: leftMs(state, now) } : state
}

export function resumeBreathe(state: BreatheState, now: number): BreatheState {
  return state.pausedMs === null ? state : { endsAt: now + state.pausedMs, pausedMs: null }
}
