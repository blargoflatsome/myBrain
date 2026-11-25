// Locking my journal (SPEC §5): the small rules the lock screens follow.
import type { LockAction } from '@/journal/lockActions'

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

/** A screen in the lock window. */
export type LockStep = 'prove' | 'passphrase' | 'recovery' | 'passkey' | 'off' | 'done'

// Each lock flow's screens in order. Turning it on and starting over choose a passphrase, show the recovery key once,
// then offer a passkey; changes to an existing lock first ask me to show it's me. A flow without 'done' closes the
// window after its last screen.
const FLOWS: Record<LockAction, readonly LockStep[]> = {
  setup: ['passphrase', 'recovery', 'passkey', 'done'],
  startOver: ['passphrase', 'recovery', 'passkey', 'done'],
  passphrase: ['prove', 'passphrase', 'done'],
  recovery: ['prove', 'recovery'],
  passkey: ['prove', 'passkey', 'done'],
  off: ['prove', 'off'],
}

/** A lock flow's screens; the passkey offer after a new lock only where this device can make one. */
export function lockSteps(action: LockAction, canPasskey: boolean): LockStep[] {
  return FLOWS[action].filter((s) => s !== 'passkey' || action === 'passkey' || canPasskey)
}

/** The screen after this one, or null when the window closes. */
export function nextStep(action: LockAction, step: LockStep, canPasskey: boolean): LockStep | null {
  const steps = lockSteps(action, canPasskey)
  return steps[steps.indexOf(step) + 1] ?? null
}
