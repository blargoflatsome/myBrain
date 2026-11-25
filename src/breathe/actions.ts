// Keeping a finished Breathe (SPEC §5 Breathe, Trophies).
import type { ActionContext } from '@/sync/actions'
import type { trophyActions } from '@/trophies/actions'
import { achieved } from '@/celebrate/bus'

export function breatheActions({ signedIn }: ActionContext, logActivity: ReturnType<typeof trophyActions>['logActivity']) {
  /** A finished Breathe, counted toward trophies. */
  async function finishBreathe() {
    // Like Focus, the five minutes can run out after signing out: nothing to keep then.
    if (!signedIn()) return
    await logActivity('breathe')
    achieved({ kind: 'breathe' })
  }

  return { finishBreathe }
}
