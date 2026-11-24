// SPEC §7 Offline and sync: screens read the device's copy of my data. This is the one way pages read it, so every
// read is empty while signed out, follows sign-in and data resets, and hides deleted rows unless asked
// (CODING_STANDARDS §9). Pages never touch `brain.db` themselves (lint).
import { toValue, type MaybeRefOrGetter, type Ref, type WatchSource } from 'vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useBrainStore } from '@/stores/brain'
import { getRow, type LocalDb, type ReadOptions } from './db'
import { live } from './live'
import type { RowTypes, SyncTable } from './types'

type Row = { deleted_at?: string | null }

/** A value worked out from my data that follows it as it changes; `initial` while signed out. */
export function useDeviceQuery<T>(query: (db: LocalDb, me: string) => Promise<T> | T, initial: T, deps: WatchSource[] = []): Ref<T> {
  const brain = useBrainStore()
  return useLiveQuery<T>(
    () => {
      const db = brain.db
      const me = brain.userId
      return db && me ? query(db, me) : initial
    },
    initial,
    [() => brain.db, ...deps],
  )
}

/**
 * My rows that follow the device: a table (`useRows('tasks')`), or a query for an index lookup
 * (`useRows((db) => db.routine_steps.where('routine_id').equals(id).toArray(), [() => id])`).
 */
export function useRows<T extends SyncTable>(table: T, deps?: WatchSource[], options?: ReadOptions): Ref<RowTypes[T][]>
export function useRows<R extends Row>(query: (db: LocalDb) => Promise<R[]>, deps?: WatchSource[], options?: ReadOptions): Ref<R[]>
export function useRows(source: SyncTable | ((db: LocalDb) => Promise<Row[]>), deps: WatchSource[] = [], { includeDeleted = false }: ReadOptions = {}) {
  return useDeviceQuery<Row[]>(
    async (db) => {
      const rows = typeof source === 'string' ? await db.rows(source).toArray() : await source(db)
      return includeDeleted ? rows : live(rows)
    },
    [],
    deps,
  )
}

/** One row that follows the device: `null` until known (or signed out), `undefined` when it's missing or deleted. */
export function useRow<T extends SyncTable>(table: T, id: MaybeRefOrGetter<string>): Ref<RowTypes[T] | null | undefined> {
  return useDeviceQuery<RowTypes[T] | null | undefined>(async (db) => (await getRow(db, table, toValue(id))) ?? undefined, null, [() => toValue(id)])
}

/** Read my rows once, now (for a button press): a table or an index query; empty while signed out, deleted rows hidden unless asked. */
export async function readRows<T extends SyncTable>(table: T, options?: ReadOptions): Promise<RowTypes[T][]>
export async function readRows<R extends Row>(query: (db: LocalDb) => Promise<R[]>, options?: ReadOptions): Promise<R[]>
export async function readRows(source: SyncTable | ((db: LocalDb) => Promise<Row[]>), { includeDeleted = false }: ReadOptions = {}): Promise<Row[]> {
  const db = useBrainStore().db
  if (!db) return []
  const rows = typeof source === 'string' ? await db.rows(source).toArray() : await source(db)
  return includeDeleted ? rows : live(rows)
}

/** Read one of my rows once, now: `null` while signed out or when it's missing or deleted. */
export async function findRow<T extends SyncTable>(table: T, id: string, options?: ReadOptions): Promise<RowTypes[T] | null> {
  const db = useBrainStore().db
  return db ? getRow(db, table, id, options) : null
}
