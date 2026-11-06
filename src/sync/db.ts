import Dexie, { type Table } from 'dexie'
import type { RowTypes, SyncTable } from './types'

export interface OutboxEntry {
  seq?: number
  table: SyncTable
  rowId: string
  row: RowTypes[SyncTable]
  /** Set when the server refused the change for a reason other than the network. */
  error?: string
}

export interface MetaEntry {
  key: string
  value: string
}

/** The on-device copy of the user's data plus the queue of changes waiting to upload (SPEC §7). */
export class LocalDb extends Dexie {
  tasks!: Table<RowTypes['tasks'], string>
  vault_buckets!: Table<RowTypes['vault_buckets'], string>
  vault_items!: Table<RowTypes['vault_items'], string>
  quests!: Table<RowTypes['quests'], string>
  inbox!: Table<RowTypes['inbox'], string>
  outbox!: Table<OutboxEntry, number>
  meta!: Table<MetaEntry, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      tasks: 'id, updated_at, due_date, status',
      vault_buckets: 'id, updated_at, position',
      vault_items: 'id, updated_at, bucket_id',
      quests: 'id, updated_at',
      inbox: 'id, updated_at',
      outbox: '++seq, table, rowId',
      meta: 'key',
    })
  }

  rows<T extends SyncTable>(table: T): Table<RowTypes[T], string> {
    return this.table(table) as Table<RowTypes[T], string>
  }
}
