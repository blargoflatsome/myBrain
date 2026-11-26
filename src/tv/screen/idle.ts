// SPEC §9 TV app, Idle screen: after 15 minutes with no button pressed the TV dims to the night screen, unless a
// routine or the Focus timer is open (active use holds it off; the 15 minutes start again when I leave it).

import type { InjectionKey } from 'vue'

export const IDLE_AFTER_MS = 15 * 60_000

/** Given by the TV page: a routine or the Focus timer calls it with true while open, false on leaving. */
export const IDLE_HOLD: InjectionKey<(on: boolean) => void> = Symbol('idle-hold')

/** True when the TV should show the night screen now. `heldEndedAt` is when active use last ended, if it has. */
export function isIdle(lastPressAt: number, now: number, held: boolean, heldEndedAt: number | null = null): boolean {
  if (held) return false
  const from = Math.max(lastPressAt, heldEndedAt ?? 0)
  return now - from >= IDLE_AFTER_MS
}
