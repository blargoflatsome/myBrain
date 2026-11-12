import type { LocalDb, OutboxEntry } from './db'
import { NetworkError, READ_ONLY_TABLES, SYNC_TABLES, type Remote, type RowTypes, type SyncStatus, type SyncTable } from './types'

/**
 * Offline-first sync (SPEC §7).
 * - Writes go to the device first and are queued (outbox), so capture works with no connection.
 * - The queue uploads in order when online. Ids are made on the device, so a retried upload
 *   updates the same row instead of creating a duplicate.
 * - Changes from other devices are pulled by updated_at since the last pull, and on Realtime events.
 * - Conflicts: the last edit to reach the server wins (the server sets updated_at). A row with
 *   changes still queued on this device is not overwritten by a pull until those changes upload.
 */
/** Some tables only change through server functions (invitations); the device never writes them directly. */
function assertWritable(table: SyncTable) {
  if (READ_ONLY_TABLES.includes(table)) throw new Error(`${table} is read-only on this device`)
}

/** How many tables download at the same time. */
const PULL_AT_ONCE = 6

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
    assertWritable(table)
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
    assertWritable(table)
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
    await this.removeMany(table, [id])
  }

  /** Soft delete several rows of one table in one step (clearing a list, deleting a bucket and its items). */
  async removeMany<T extends SyncTable>(table: T, ids: readonly string[]): Promise<void> {
    assertWritable(table)
    if (!ids.length) return
    const deletedAt = new Date().toISOString()
    let changed = false
    await this.db.transaction('rw', [this.db.rows(table), this.db.outbox], async () => {
      for (const row of await this.db.rows(table).bulkGet([...ids])) {
        if (!row) continue
        const gone = { ...row, deleted_at: deletedAt } as RowTypes[T]
        await this.db.rows(table).put(gone)
        await this.db.outbox.add({ table, rowId: gone.id, row: gone })
        changed = true
      }
    })
    if (!changed) return
    await this.refreshPending()
    this.flush().catch(() => {})
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
      // Rows are queued whole, so an older copy that a later save of the same row replaces needn't be sent.
      if (await this.supersededLater(entry)) {
        await this.db.outbox.delete(entry.seq!)
        continue
      }
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

  private async supersededLater(entry: OutboxEntry): Promise<boolean> {
    const later = await this.db.outbox.where('rowId').equals(entry.rowId).filter((e) => e.seq! > entry.seq! && e.table === entry.table && !e.error).count()
    return later > 0
  }

  /** Pull changes from the server. A row with changes still queued on this device is left alone. */
  async pull(tables: readonly SyncTable[] = SYNC_TABLES): Promise<void> {
    if (!this.isOnline()) {
      await this.setState('offline')
      return
    }
    try {
      // A few tables at a time: one after another, a sync waited on every table's round trip in turn.
      const queue = [...tables]
      const worker = async () => {
        for (let table = queue.shift(); table; table = queue.shift()) await this.pullTable(table)
      }
      await Promise.all(Array.from({ length: Math.min(PULL_AT_ONCE, queue.length) }, worker))
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
    const downloaded = `downloaded:${table}`
    if (!(await this.db.meta.get(downloaded))) await this.db.meta.put({ key: downloaded, value: 'yes' })
    if (!rows.length) return
    await this.db.transaction('rw', [this.db.rows(table), this.db.outbox, this.db.meta], async () => {
      let latest = since
      for (const row of rows) {
        const queued = await this.db.outbox.where('rowId').equals(row.id).count()
        // A pull that started before my latest change uploaded can bring back an older copy: never step back.
        // (updated_at on the device always comes from the server, so the two are comparable.)
        const mine = queued ? undefined : await this.db.rows(table).get(row.id)
        const older = !!(mine?.updated_at && row.updated_at && row.updated_at < mine.updated_at)
        if (!queued && !older) await this.db.rows(table).put(row)
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
    this.emit({ ...this.status, pending: await this.countPending() })
  }

  private async setState(state: SyncStatus['state']) {
    this.emit({ state, pending: await this.countPending() })
  }

  /** Changes waiting to upload, as I'd count them: the trophies' background log isn't something I saved. */
  private countPending() {
    return this.db.outbox.filter((o) => o.table !== 'activity_log').count()
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
