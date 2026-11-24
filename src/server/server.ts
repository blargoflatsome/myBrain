// SPEC §7 Things only the server can do: every feature's server function goes through here, so each one refuses
// offline before trying and fails with one error that says why. Calls that change my synced tables are brain actions
// (`src/sync/actions.ts` `onServer`), which also bring my copy up to date.

/** Why a server call didn't go through: no connection, a limit the server keeps, or anything else. */
export type ServerReason = 'offline' | 'limit' | 'failed'

/** A server call that didn't go through. Its message is for the console only; screens show wording per reason. */
export class ServerError extends Error {
  constructor(
    readonly reason: ServerReason,
    message: string = reason,
  ) {
    super(message)
    this.name = 'ServerError'
  }
}

/** Where calls go: Supabase in the app, a fake in tests (`src/tests/support/fakeServer.ts`). */
export interface ServerAdapter {
  online(): boolean
  /** Runs one server function; throws a `ServerError` when it fails. */
  call(fn: string, args: Record<string, unknown>): Promise<unknown>
}

/** The server's code for "a limit was reached" (SPEC §7): every limit raises it. */
const LIMIT_CODE = 'P0429'

const supabaseAdapter: ServerAdapter = {
  online: () => typeof navigator === 'undefined' || navigator.onLine,
  async call(fn, args) {
    // Loaded on first use, so code that never calls the server (and unit tests with a fake) never needs its keys.
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.rpc(fn, args)
    if (!error) return data
    const reason: ServerReason = error.code === LIMIT_CODE ? 'limit' : !supabaseAdapter.online() ? 'offline' : 'failed'
    throw new ServerError(reason, `${fn}: ${error.message}`)
  },
}

let adapter = supabaseAdapter

/** Send calls somewhere else (tests); returns a function that puts the Supabase adapter back. */
export function useServerAdapter(next: ServerAdapter): () => void {
  adapter = next
  return () => {
    adapter = supabaseAdapter
  }
}

/** True when a call can be tried now. */
export const serverOnline = () => adapter.online()

/** Run a server function and return its answer. */
export async function serverCall<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!adapter.online()) throw new ServerError('offline', `${fn}: offline`)
  try {
    return (await adapter.call(fn, args)) as T
  } catch (err) {
    if (err instanceof ServerError) throw err
    // A dropped request throws instead of answering.
    throw new ServerError(adapter.online() ? 'failed' : 'offline', `${fn}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Run a server function that answers with rows (an empty answer is no rows). */
export async function serverList<T>(fn: string, args: Record<string, unknown> = {}): Promise<T[]> {
  return (await serverCall<T[] | null>(fn, args)) ?? []
}

/** Why something failed, for the wording shown (anything that isn't a `ServerError` counts as failed). */
export const reasonOf = (err: unknown): ServerReason => (err instanceof ServerError ? err.reason : 'failed')

/** The words for why a call failed, one per reason, from `messages.ts`. */
export const sayWhy = (err: unknown, words: Record<ServerReason, string>): string => {
  if (!(err instanceof ServerError)) console.error(err)
  return words[reasonOf(err)]
}
