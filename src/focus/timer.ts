// Focus timer (SPEC §5 Focus timer): standard Pomodoro, worked out from start and end times, not a ticking counter,
// so it keeps time across pages, reloads and app switches.

export type FocusPhase = 'work' | 'short' | 'long'

export const WORK_MS = 25 * 60_000
export const SHORT_MS = 5 * 60_000
export const LONG_MS = 15 * 60_000
export const ROUNDS = 4

export const durationOf = (phase: FocusPhase) => (phase === 'work' ? WORK_MS : phase === 'short' ? SHORT_MS : LONG_MS)

export interface FocusState {
  phase: FocusPhase
  /** 1 to 4: which work round this is (or follows). */
  round: number
  /** When the current part ends (ms since 1970), while running. */
  endsAt: number | null
  /** Time left when paused. */
  pausedMs: number | null
}

export function startFocus(now: number): FocusState {
  return { phase: 'work', round: 1, endsAt: now + WORK_MS, pausedMs: null }
}

/** What comes after a part: a break after work (every 4th a long one), then the next round of work. */
export function nextPart(phase: FocusPhase, round: number): { phase: FocusPhase; round: number } {
  if (phase === 'work') return { phase: round % ROUNDS === 0 ? 'long' : 'short', round }
  return { phase: 'work', round: phase === 'long' ? 1 : round + 1 }
}

/** Move on to the next part now (Skip), starting its full time. */
export function skip(state: FocusState, now: number): FocusState {
  const next = nextPart(state.phase, state.round)
  return { ...next, endsAt: state.pausedMs === null ? now + durationOf(next.phase) : null, pausedMs: state.pausedMs === null ? null : durationOf(next.phase) }
}

/**
 * Bring a running timer up to `now`: every part that ended while I was away is passed, each next one starting when
 * the last ended. Returns the new state and how many parts ended (to know whether to chime).
 */
export function catchUp(state: FocusState, now: number): { state: FocusState; ended: number } {
  if (state.endsAt === null) return { state, ended: 0 }
  let current = state
  let ended = 0
  while (current.endsAt !== null && current.endsAt <= now && ended < 100) {
    const next = nextPart(current.phase, current.round)
    current = { ...next, endsAt: current.endsAt + durationOf(next.phase), pausedMs: null }
    ended++
  }
  return { state: current, ended }
}

export function pause(state: FocusState, now: number): FocusState {
  if (state.endsAt === null) return state
  return { ...state, endsAt: null, pausedMs: Math.max(0, state.endsAt - now) }
}

export function resume(state: FocusState, now: number): FocusState {
  if (state.pausedMs === null) return state
  return { ...state, endsAt: now + state.pausedMs, pausedMs: null }
}

export function remainingMs(state: FocusState, now: number): number {
  if (state.pausedMs !== null) return state.pausedMs
  return state.endsAt === null ? 0 : Math.max(0, state.endsAt - now)
}

/** "24:59" */
export function clock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
