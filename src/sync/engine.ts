import type { LocalDb, OutboxEntry } from './db'
import { NetworkError, SYNC_TABLES, type Remote, type RowTypes, type SyncStatus, type SyncTable } from './types'

/**
 * Offline-first sync (SPEC §7).
 * - Writes go to the device first and are queued (outbox), so capture works with no connection.
 * - The queue uploads in order when online. Ids are made on the device, so a retried upload
 *   updates the same row instead of creating a duplicate.
 * - Changes from other devices are pulled by updated_at since the last pull, and on Realtime events.
 * - Conflicts: the last edit to reach the server wins (the server sets updated_at). A row with
 *   changes still queued on this device is not overwritten by a pull until those changes upload.
 */
export class SyncEngine {
  private flushing: Promise<void> | null = null
  private flushAgain = false
  private status: SyncStatus = { state: 'synced', pending: 0 }

  constructor(
    private readonly db: LocalDb,
    private readonly remote: Remote,
    private readonly onStatus: (status: SyncStatus) => void = () => {},
    private readonly isOnline: () => boolean = () => true,
  ) {}

  /** Save a row on the device and queue it for upload. Resolves once it is safely stored locally. */
  async save<T extends SyncTable>(table: T, input: RowTypes[T]): Promise<RowTypes[T]> {
    // Store a plain copy: rows coming from the screens can be Vue reactive proxies (for example a habit's
    // weekdays list), which IndexedDB cannot store. Rows are plain JSON, so this copy is exact.
    const row = JSON.parse(JSON.stringify(input)) as RowTypes[T]
    await this.db.transaction('rw', [this.db.rows(table), this.db.outbox], async () => {
      await this.db.rows(table).put(row)
      await this.db.outbox.add({ table, rowId: row.id, row })
    })
    await this.refreshPending()
    this.flush().catch(() => {}) // failures are reported through status; the change stays queued
    return row
  }

  /**
   * Change some fields of the latest stored copy, reading and writing in one step so an edit saved at the same
   * moment is never overwritten (used for background updates such as cached streak numbers).
   * Returns false when nothing needed changing.
   */
  async patch<T extends SyncTable>(table: T, id: string, change: (row: RowTypes[T]) => Partial<RowTypes[T]> | null): Promise<boolean> {
    let changed = false
    await this.db.transaction('rw', [this.db.rows(table), this.db.outbox], async () => {
      const current = await this.db.rows(table).get(id)
      if (!current) return
      const fields = change(current)
      if (!fields) return
      const row = JSON.parse(JSON.stringify({ ...current, ...fields })) as RowTypes[T]
      await this.db.rows(table).put(row)
      await this.db.outbox.add({ table, rowId: row.id, row })
      changed = true
    })
    if (changed) {
      await this.refreshPending()
      this.flush().catch(() => {})
    }
    return changed
  }

  /** Soft delete (SPEC §7): the row is kept with deleted_at set, so the deletion syncs to other devices. */
  async remove<T extends SyncTable>(table: T, id: string): Promise<void> {
    const row = await this.db.rows(table).get(id)
    if (!row) return
    await this.save(table, { ...row, deleted_at: new Date().toISOString() })
  }

  /** Upload queued changes in order. Stops at the first network failure and keeps the rest queued. */
  flush(): Promise<void> {
    if (this.flushing) {
      // A change may have been queued after the running pass looked; run once more when it ends.
      this.flushAgain = true
      return this.flushing
    }
    this.flushing = (async () => {
      do {
        this.flushAgain = false
        await this.doFlush()
      } while (this.flushAgain)
    })().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  private async doFlush() {
    if (!this.isOnline()) {
      await this.setState('offline')
      return
    }
    for (;;) {
      const entry = await this.nextEntry()
      if (!entry) break
      await this.setState('syncing')
      try {
        const stored = await this.remote.upsert(entry.table, entry.row)
        await this.db.transaction('rw', [this.db.rows(entry.table), this.db.outbox], async () => {
          await this.db.outbox.delete(entry.seq!)
          const stillQueued = await this.db.outbox.where('rowId').equals(entry.rowId).count()
          if (!stillQueued) await this.db.rows(entry.table).put(stored)
        })
      } catch (err) {
        if (err instanceof NetworkError) {
          await this.setState('offline')
          return
        }
        await this.db.outbox.update(entry.seq!, { error: err instanceof Error ? err.message : String(err) })
      }
    }
    const refused = await this.db.outbox.filter((e) => !!e.error).count()
    await this.setState(refused ? 'error' : 'synced')
  }

  private nextEntry(): Promise<OutboxEntry | undefined> {
    return this.db.outbox.orderBy('seq').filter((e) => !e.error).first()
  }

  /** Pull changes from the server. A row with changes still queued on this device is left alone. */
  async pull(tables: readonly SyncTable[] = SYNC_TABLES): Promise<void> {
    if (!this.isOnline()) {
      await this.setState('offline')
      return
    }
    try {
      for (const table of tables) await this.pullTable(table)
    } catch (err) {
      if (err instanceof NetworkError) {
        await this.setState('offline')
        return
      }
      throw err
    }
  }

  private async pullTable(table: SyncTable) {
    const key = `pulled:${table}`
    const since = (await this.db.meta.get(key))?.value ?? null
    const rows = await this.remote.pullSince(table, since)
    // Note that this device has the server's copy of the table, even when it was empty.
    await this.db.meta.put({ key: `downloaded:${table}`, value: 'yes' })
    if (!rows.length) return
    await this.db.transaction('rw', [this.db.rows(table), this.db.outbox, this.db.meta], async () => {
      let latest = since
      for (const row of rows) {
        const queued = await this.db.outbox.where('rowId').equals(row.id).count()
        if (!queued) await this.db.rows(table).put(row)
        if (row.updated_at && (!latest || row.updated_at > latest)) latest = row.updated_at
      }
      if (latest) await this.db.meta.put({ key, value: latest })
    })
  }

  /**
   * Upload everything queued, then pull everything new. Changes the server refused earlier are tried again
   * on every sync (app start, reconnect), so a temporary server problem, such as a table not migrated yet,
   * never strands a capture on the device.
   */
  async sync(): Promise<void> {
    await this.db.outbox.toCollection().modify((e) => {
      delete e.error
    })
    await this.flush()
    if (this.status.state === 'offline') return
    await this.pull()
  }

  private async refreshPending() {
    const pending = await this.db.outbox.count()
    this.emit({ ...this.status, pending })
  }

  private async setState(state: SyncStatus['state']) {
    const pending = await this.db.outbox.count()
    this.emit({ state, pending })
  }

  private emit(status: SyncStatus) {
    if (status.state === this.status.state && status.pending === this.status.pending) return
    this.status = status
    this.onStatus(status)
  }

  getStatus(): SyncStatus {
    return this.status
  }
}
