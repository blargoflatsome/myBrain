// SPEC §5 Locking my journal: whether my journal is locked, whether this device has unlocked it, and my passkeys,
// following the device's data (another device turning the lock on or off shows here at once).
import { computed } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { live } from '@/sync/live'
import type { JournalPasskeyRow } from '@/sync/types'

interface LockState {
  /** False until this device has downloaded my lock (a new device mustn't offer the editor before it knows). */
  known: boolean
  on: boolean
  unlocked: boolean
  passkeys: JournalPasskeyRow[]
  /** Journal entries waiting to upload (shown as "Locking 143 entries…" while the lock is new). */
  pending: number
}

export function useJournalLock() {
  const brain = useBrainStore()
  const state = useLiveQuery<LockState>(
    async () => {
      const db = brain.db
      if (!db) return { known: false, on: false, unlocked: false, passkeys: [], pending: 0 }
      const row = (await db.journal_keys.toArray()).find((r) => !r.deleted_at)
      const secret = await db.secrets.get('journal')
      const passkeys = live(await db.journal_passkeys.toArray())
      const pending = await db.outbox.where('table').equals('journal_entries').count()
      const known = !!row || !!(await db.meta.get('downloaded:journal_keys'))
      return { known, on: !!row, unlocked: !!row && secret?.keyRowId === row.id, passkeys, pending }
    },
    { known: false, on: false, unlocked: false, passkeys: [], pending: 0 },
    [() => brain.db],
  )
  return {
    state,
    /** Locked and not yet unlocked on this device: the writing can't be shown or written. */
    locked: computed(() => state.value.on && !state.value.unlocked),
    /** Whether this device knows yet if my journal is locked. */
    known: computed(() => state.value.known),
  }
}
