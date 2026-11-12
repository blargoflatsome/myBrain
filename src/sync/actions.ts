// What each feature's actions (src/<feature>/actions.ts) get from the data store: the open store and sync engine
// for whoever is signed in, and whether this device has downloaded what some rules need first (SPEC §7).
import type { Ref } from 'vue'
import type { LocalDb } from './db'
import type { SyncEngine } from './engine'

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
