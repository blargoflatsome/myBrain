// Locking my journal (SPEC §5): whether my journal is locked, and this device's unlocked key. The key is kept in
// the device's own store (never synced) as a non-exportable WebCrypto key, until sign out deletes the store.
import type { LocalDb } from '@/sync/db'
import type { JournalEntryRow, JournalKeyRow } from '@/sync/types'
import { decryptField, encryptField, type FieldPlace } from '@/journal/crypto'

const SECRET = 'journal'
const FIELDS = ['body', 'tomorrow'] as const

export class JournalKeyring {
  constructor(private readonly db: LocalDb) {}

  /** My live journal_keys row: present means my journal is locked. */
  async keyRow(): Promise<JournalKeyRow | undefined> {
    return (await this.db.journal_keys.toArray()).find((r) => !r.deleted_at)
  }

  /** This device's journal key, only if it belongs to the current lock (a key from an earlier lock is never used). */
  async key(): Promise<CryptoKey | null> {
    return (await this.lock()).key
  }

  /** Whether my journal is locked, and whether this device is unlocked for that lock (SPEC §5 Locking my journal). */
  async state(): Promise<{ on: boolean; unlocked: boolean }> {
    const { row, key } = await this.lock()
    return { on: !!row, unlocked: !!key }
  }

  // Both reads start before the first await, so a live query (useJournalLock) follows them both.
  private async lock(): Promise<{ row?: JournalKeyRow; key: CryptoKey | null }> {
    const [rows, secret] = await Promise.all([this.db.journal_keys.toArray(), this.db.secrets.get(SECRET)])
    const row = rows.find((r) => !r.deleted_at)
    if (!row) return { key: null }
    return { row, key: secret?.keyRowId === row.id ? secret.value : null }
  }

  async remember(keyRowId: string, value: CryptoKey): Promise<void> {
    await this.db.secrets.put({ key: SECRET, keyRowId, value })
  }

  async forget(): Promise<void> {
    await this.db.secrets.delete(SECRET)
  }

  /** A row to upload: its writing encrypted while my journal is locked and this device has the key. */
  async seal(row: JournalEntryRow, uid: string): Promise<JournalEntryRow> {
    const key = await this.key()
    if (!key) return row
    const out = { ...row }
    for (const field of FIELDS) {
      const value = out[field]
      if (value) out[field] = await encryptField(key, value, place(out, uid, field))
    }
    return out
  }

  /** A row from the server, with its writing decrypted when this device has the key. Fields that won't open stay encrypted. */
  async open(row: JournalEntryRow, uid: string, key?: CryptoKey | null): Promise<JournalEntryRow> {
    const k = key === undefined ? await this.key() : key
    if (!k) return row
    const out = { ...row }
    for (const field of FIELDS) {
      const value = out[field]
      if (!value) continue
      try {
        out[field] = await decryptField(k, value, place(out, uid, field))
      } catch {
        // Shown as "couldn't be opened" rather than breaking the page (SPEC §5 Locking my journal).
      }
    }
    return out
  }
}

function place(row: JournalEntryRow, uid: string, field: FieldPlace['field']): FieldPlace {
  return { userId: row.user_id ?? uid, entryId: row.id, field }
}

const keyrings = new WeakMap<LocalDb, JournalKeyring>()
/** The keyring for a device store (one per signed-in user). */
export function keyringFor(db: LocalDb): JournalKeyring {
  let k = keyrings.get(db)
  if (!k) keyrings.set(db, (k = new JournalKeyring(db)))
  return k
}
