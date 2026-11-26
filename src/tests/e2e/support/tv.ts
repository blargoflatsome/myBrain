// Helpers for the TV page (SPEC §9): a paired TV, and what tv_snapshot answers.
import type { Page } from '@playwright/test'

export const TV_KEY_STORE = 'my-brain:tv-device-key'

/** Opens the TV page already paired (its key saved), as after pairing. */
export const pairedTv = (page: Page, key = 'old-key') => page.addInitScript(([k, v]) => localStorage.setItem(k!, v!), [TV_KEY_STORE, key])

/** A tv_snapshot answer (the shape of `SnapshotAnswer` in src/tv/screen/snapshot.ts) with nothing in it but what's given. */
export function tvSnapshot(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    me: 'me', now: '2026-11-26T03:00:00Z', tasks: [], events: [], invites: [], habits: [], habit_logs: [], habit_pauses: [],
    routines: [], routine_runs: [], orphans: 0, wrote_today: false, journal_time: null, ...extra,
  }
}
