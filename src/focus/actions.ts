// Keeping finished Focus sessions (SPEC §5 Focus timer, Trophies).
import type { ActionContext } from '@/sync/actions'
import type { trophyActions } from '@/trophies/actions'
import { WORK_MS } from '@/focus/timer'
import { achieved } from '@/celebrate/bus'

export function focusActions({ signedIn }: ActionContext, logActivity: ReturnType<typeof trophyActions>['logActivity']) {
  /** Finished Focus work sessions (and whether anyone else was in the focus room), counted toward trophies. */
  async function finishFocus(sessions: number, together = false) {
    // A timer can still run out after signing out: nothing to keep then.
    if (!signedIn()) return
    for (let i = 0; i < sessions; i++) await logActivity('focus', { minutes: WORK_MS / 60_000, ...(together ? { together: true } : {}) })
    achieved({ kind: 'focus', sessions, together })
  }

  return { finishFocus }
}
