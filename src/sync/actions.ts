// What each feature's actions (src/<feature>/actions.ts) get from the data store: the open store and sync engine
// for whoever is signed in, and whether this device has downloaded what some rules need first (SPEC §7).
import type { Ref } from 'vue'
import type { LocalDb } from './db'
import type { SyncEngine } from './engine'
import type { SyncTable } from './types'

/** Puts back everything a change did (SPEC §2 Undo); each delete returns its own, so the Undo bar never guesses. */
export type Undo = () => Promise<void>

export interface Ready {
  engine: SyncEngine
  uid: string
  local: LocalDb
}

export interface ActionContext {
  /** The signed-in user's engine and store; throws when nobody is signed in. */
  ready: () => Ready
  /** True once this device holds the server's habit history, so misses are never guessed. */
  habitsReady: Readonly<Ref<boolean>>
  /** True once this device holds my badges, so a badge I already have is never earned again. */
  badgesReady: Readonly<Ref<boolean>>
}

/** Soft-delete rows and return the Undo that brings them back (SPEC §2): deletes are soft, so they come back as they were. */
export async function removeWithUndo(ready: () => Ready, table: SyncTable, ids: readonly string[]): Promise<Undo> {
  await ready().engine.removeMany(table, ids)
  return async () => {
    const e = ready().engine
    for (const id of ids) await e.patch(table, id, () => ({ deleted_at: null }))
  }
}
