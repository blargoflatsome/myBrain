// Offline-first sync (SPEC §7): a custom queue on Dexie. See engine.ts.

export const SYNC_TABLES = ['tasks', 'vault_buckets', 'vault_items', 'quests', 'inbox'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

/** Columns every synced row has (SPEC §4). Timestamps are set by the server. */
export interface BaseRow {
  id: string
  user_id?: string
  created_at?: string
  updated_at?: string
  deleted_at: string | null
}

export interface TaskRow extends BaseRow {
  title: string
  notes?: string | null
  due_date: string | null
  priority?: number
  status: 'open' | 'done' | 'cancelled'
  completed_at?: string | null
  source: 'manual' | 'capture' | 'journal'
}

export interface VaultBucketRow extends BaseRow {
  name: string
  position: number
}

export interface VaultItemRow extends BaseRow {
  bucket_id: string
  title: string
  notes?: string | null
}

export type EnergyLevel = 'meh' | 'ugh' | 'medicated'
export type TimeBucket = '30m' | '2h' | 'half_day' | 'full_day'

export interface QuestRow extends BaseRow {
  title: string
  details?: string | null
  energy_level?: EnergyLevel | null
  time_bucket?: TimeBucket | null
  status: 'open' | 'accepted' | 'done'
  last_picked_at?: string | null
  times_picked?: number
}

export interface InboxRow extends BaseRow {
  body: string
}

export interface RowTypes {
  tasks: TaskRow
  vault_buckets: VaultBucketRow
  vault_items: VaultItemRow
  quests: QuestRow
  inbox: InboxRow
}

/** Thrown when the server can't be reached. The change stays queued and is retried later. */
export class NetworkError extends Error {
  constructor(message = 'Network unavailable') {
    super(message)
    this.name = 'NetworkError'
  }
}

/** The server side of sync. Supabase in the app, a fake in tests. */
export interface Remote {
  /** Insert or update one row; returns the row as stored (with server timestamps). */
  upsert<T extends SyncTable>(table: T, row: RowTypes[T]): Promise<RowTypes[T]>
  /** Rows changed at or after `since` (all rows when null), oldest first. */
  pullSince<T extends SyncTable>(table: T, since: string | null): Promise<RowTypes[T][]>
  /** Calls back when another device changes a table. Returns an unsubscribe function. */
  subscribe(onChange: (table: SyncTable) => void): () => void
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error'
export interface SyncStatus {
  state: SyncState
  pending: number
}
