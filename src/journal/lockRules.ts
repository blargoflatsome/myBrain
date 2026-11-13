// Locking my journal (SPEC §5): the small rules the lock screens follow.

/** A passphrase is at least this long. */
export const MIN_PASSPHRASE = 12
/** Wrong tries before waiting. */
export const MAX_TRIES = 5
/** How long to wait after too many wrong tries. */
export const WAIT_MS = 30_000

/** What's wrong with a new passphrase and its repeat, or null when it can be used. */
export function passphraseProblem(passphrase: string, repeat: string): 'short' | 'mismatch' | null {
  if ([...passphrase].length < MIN_PASSPHRASE) return 'short'
  if (passphrase !== repeat) return 'mismatch'
  return null
}

/** Milliseconds left to wait before trying again (0 = go ahead). */
export function waitLeft(failures: number, lastFailureAt: number, now: number): number {
  if (failures < MAX_TRIES) return 0
  return Math.max(0, lastFailureAt + WAIT_MS - now)
}
