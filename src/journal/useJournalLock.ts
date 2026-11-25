// SPEC §5 Locking my journal: whether my journal is locked, whether this device has unlocked it, and my passkeys,
// following the device's data (another device turning the lock on or off shows here at once).
import { useDeviceQuery } from '@/sync/useRows'
import { computed } from 'vue'
import { live } from '@/sync/live'
import { keyringFor } from '@/journal/keyring'
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
  const state = useDeviceQuery<LockState>(
    async (db) => {
      // Every read starts before the first await: a live query only follows reads made before it awaits other code.
      const [{ on, unlocked }, passkeys, pending, downloaded] = await Promise.all([
        keyringFor(db).state(),
        db.journal_passkeys.toArray(),
        db.outbox.where('table').equals('journal_entries').count(),
        db.meta.get('downloaded:journal_keys'),
      ])
      return { known: on || !!downloaded, on, unlocked, passkeys: live(passkeys), pending }
    },
    { known: false, on: false, unlocked: false, passkeys: [], pending: 0 },
  )
  return {
    state,
    /** Locked and not yet unlocked on this device: the writing can't be shown or written. */
    locked: computed(() => state.value.on && !state.value.unlocked),
    /** Whether this device knows yet if my journal is locked. */
    known: computed(() => state.value.known),
  }
}
