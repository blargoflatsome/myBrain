import type { SupabaseClient } from '@supabase/supabase-js'
import { NetworkError, SYNC_TABLES, type Remote, type RowTypes, type SyncTable } from './types'

const PAGE = 1000

/** A failed request with no HTTP status means the server was never reached. */
function check(error: { message: string } | null, status: number) {
  if (!error) return
  if (!status || status >= 500 || /fetch|network/i.test(error.message)) throw new NetworkError(error.message)
  throw new Error(error.message)
}

/** Strip fields the server owns, so the device clock never decides them (SPEC §4, §7). */
function forUpload<T extends { created_at?: string; updated_at?: string }>(row: T) {
  const rest: Partial<T> = { ...row }
  delete rest.created_at
  delete rest.updated_at
  return rest
}

export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async upsert<T extends SyncTable>(table: T, row: RowTypes[T]) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new NetworkError()
      const { data, error, status } = await client.from(table).upsert(forUpload(row) as never).select().single()
      check(error, status)
      return data as RowTypes[T]
    },

    async pullSince<T extends SyncTable>(table: T, since: string | null) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new NetworkError()
      const rows: RowTypes[T][] = []
      for (let from = 0; ; from += PAGE) {
        let query = client.from(table).select('*').order('updated_at').range(from, from + PAGE - 1)
        if (since) query = query.gte('updated_at', since)
        const { data, error, status } = await query
        check(error, status)
        rows.push(...((data ?? []) as RowTypes[T][]))
        if (!data || data.length < PAGE) return rows
      }
    },

    subscribe(onChange) {
      const channel = client.channel('my-brain-sync')
      for (const table of SYNC_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table))
      }
      channel.subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
  }
}
