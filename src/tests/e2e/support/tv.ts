// Helpers for the TV page (SPEC §9): a paired TV, and what tv_snapshot answers.
import type { Page } from '@playwright/test'

export const TV_KEY_STORE = 'my-brain:tv-device-key'

/** Opens the TV page already paired (its key saved), as after pairing. */
export const pairedTv = (page: Page, key = 'old-key') => page.addInitScript(([k, v]) => localStorage.setItem(k!, v!), [TV_KEY_STORE, key])

/** A tv_snapshot answer (the shape of `SnapshotAnswer` in src/tv/screen/snapshot.ts) with nothing in it but what's given. */
export function tvSnapshot(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    me: 'me', now: '2026-11-26T03:00:00Z', tasks: [], events: [], invites: [], habits: [], habit_logs: [], habit_pauses: [],
    routines: [], routine_runs: [], routine_steps: [], routine_step_logs: [], orphans: 0, wrote_today: false, journal_time: null, ...extra,
  }
}

/** A routine that runs every day, with its steps, as tv_snapshot sends them (SPEC §9 Routines). */
export function tvRoutine(title: string, stepTitles: string[], id = 'r1') {
  return {
    routine: { id, title, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', week_interval: 1, notify_time: null, deleted_at: null },
    steps: stepTitles.map((t, i) => ({ id: `${id}-s${i + 1}`, routine_id: id, position: i, title: t, habit_id: null, start_date: '2026-11-01', deleted_at: null })),
  }
}
