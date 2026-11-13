// Locking my journal (SPEC §5, §7): journal writing is encrypted on its way to the server and decrypted on its way
// back, so the device's own copy stays plain text and every feature reads it as before. Other tables pass through.
import type { JournalEntryRow, Remote, RowTypes, SyncTable } from '@/sync/types'
import type { JournalKeyring } from '@/journal/keyring'

/** The server connection, with journal writing encrypted and decrypted at the boundary. */
export function lockingRemote(remote: Remote, keyring: JournalKeyring, uid: string): Remote {
  const isJournal = (table: SyncTable) => table === 'journal_entries'
  const seal = <T extends SyncTable>(table: T, row: RowTypes[T]) =>
    isJournal(table) ? (keyring.seal(row as JournalEntryRow, uid) as Promise<RowTypes[T]>) : Promise.resolve(row)
  async function openAll<T extends SyncTable>(table: T, rows: RowTypes[T][]): Promise<RowTypes[T][]> {
    if (!isJournal(table) || !rows.length) return rows
    const key = await keyring.key()
    return Promise.all(rows.map((r) => keyring.open(r as JournalEntryRow, uid, key) as Promise<RowTypes[T]>))
  }
  return {
    async upsert(table, row) {
      const [stored] = await openAll(table, [await remote.upsert(table, await seal(table, row))])
      return stored!
    },
    async upsertMany(table, rows) {
      return openAll(table, await remote.upsertMany(table, await Promise.all(rows.map((r) => seal(table, r)))))
    },
    async pullSince(table, since) {
      return openAll(table, await remote.pullSince(table, since))
    },
    subscribe: (onChange) => remote.subscribe(onChange),
  }
}
