// What each feature's actions (src/<feature>/actions.ts) get from the data store: the open store and sync engine
// for whoever is signed in, and whether this device has downloaded what some rules need first (SPEC §7).
import type { Ref } from 'vue'
import type { LocalDb } from './db'
import type { SyncEngine } from './engine'
import type { SyncTable } from './types'
import { ServerError, serverCall, serverOnline } from '@/server/server'

/** Puts back everything a change did (SPEC §2 Undo); each delete returns its own, so Undo never guesses. */
export type Undo = () => Promise<void>

export interface Ready {
  engine: SyncEngine
  uid: string
  local: LocalDb
}

export interface ActionContext {
  /** The signed-in user's engine and store; throws when nobody is signed in. */
  ready: () => Ready
  /** Whether anyone is signed in, for work that can finish after signing out (a timer running out). */
  signedIn: () => boolean
  /** True once this device holds the server's habit history, so misses are never guessed. */
  habitsReady: Readonly<Ref<boolean>>
  /** True once this device holds my badges, so a badge I already have is never earned again. */
  badgesReady: Readonly<Ref<boolean>>
  /** Run a server function that changes some of my synced tables, then bring my copy of them up to date (SPEC §7). */
  onServer: OnServer
}

export type OnServer = <T = void>(fn: string, args: Record<string, unknown>, changes: readonly SyncTable[]) => Promise<T>

/** `onServer` for whoever `ready` says is signed in. */
export function onServerWith(ready: () => Ready): OnServer {
  return async <T>(fn: string, args: Record<string, unknown>, changes: readonly SyncTable[]) => {
    if (!serverOnline()) throw new ServerError('offline', `${fn}: offline`)
    const { engine } = ready()
    // My own queued changes go first: an event saved a moment ago must be on the server before people are invited to it.
    await engine.flush()
    const answer = await serverCall<T>(fn, args)
    // It's done on the server either way; if this download fails, the next sync brings it.
    await engine.pull(changes).catch((err: unknown) => console.error(err))
    return answer
  }
}

/** Soft-delete rows and return the Undo that brings them back (SPEC §2): deletes are soft, so they come back as they were. */
export async function removeWithUndo(ready: () => Ready, table: SyncTable, ids: readonly string[]): Promise<Undo> {
  await ready().engine.removeMany(table, ids)
  return async () => {
    const e = ready().engine
    for (const id of ids) await e.patch(table, id, () => ({ deleted_at: null }))
  }
}
