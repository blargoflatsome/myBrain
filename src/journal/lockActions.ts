// Locking my journal (SPEC §5 Locking my journal): turning it on and off, unlocking a device, passkeys, changing
// the passphrase or recovery key, and starting over.
import type { ActionContext } from '@/sync/actions'
import type { LocalDb } from '@/sync/db'
import type { SyncEngine } from '@/sync/engine'
import type { JournalEntryRow, JournalKeyRow, JournalPasskeyRow } from '@/sync/types'
import { live } from '@/sync/live'
import { keyringFor } from '@/journal/keyring'
import {
  deviceKey,
  isEncrypted,
  newJournalLock,
  openWithPassphrase,
  openWithRecoveryKey,
  passkeyKey,
  passphraseFields,
  randomBytes,
  recoveryFields,
  toBase64,
  unwrapJournalKey,
  wrapJournalKey,
} from '@/journal/crypto'
import { askJournalPasskey, createJournalPasskey } from '@/journal/passkeys'

/** How I prove it's me: my passphrase, my recovery key, or one of my passkeys. */
export type JournalProof = { kind: 'passphrase'; secret: string } | { kind: 'recovery'; secret: string } | { kind: 'passkey' }
/** The lock flows the Account page offers (SPEC §5 Locking my journal). */
export type LockAction = 'setup' | 'startOver' | 'passphrase' | 'recovery' | 'passkey' | 'off'
/** The journal key's bytes, held in memory only while a change is made. */
export type JournalKeyBytes = Uint8Array<ArrayBuffer>

const hasWriting = (e: JournalEntryRow) => !!e.body || !!e.tomorrow

export function journalLockActions({ ready }: ActionContext) {
  async function liveRow(local: LocalDb): Promise<JournalKeyRow> {
    const row = await keyringFor(local).keyRow()
    if (!row) throw new Error('My journal is not locked')
    return row
  }
  const livePasskeys = async (local: LocalDb) => live(await local.journal_passkeys.toArray())

  /** Every entry with writing goes back in the upload queue, so it's uploaded encrypted (or plain, once unlocked). */
  async function requeueWriting(e: SyncEngine, local: LocalDb) {
    for (const entry of live(await local.journal_entries.toArray()).filter(hasWriting)) await e.patch('journal_entries', entry.id, () => ({}))
  }

  /** Decrypt this device's encrypted copies in place (they came down before it was unlocked). Not uploaded again. */
  async function openLocalCopies(local: LocalDb, uid: string, key: CryptoKey) {
    const keyring = keyringFor(local)
    for (const entry of await local.journal_entries.toArray()) {
      if (!isEncrypted(entry.body) && !isEncrypted(entry.tomorrow)) continue
      const opened = await keyring.open(entry, uid, key)
      // Crypto can't run inside a Dexie transaction, so the copy is replaced only if it hasn't changed meanwhile.
      await local.transaction('rw', local.journal_entries, async () => {
        const now = await local.journal_entries.get(entry.id)
        if (now && now.body === entry.body && now.tomorrow === entry.tomorrow) await local.journal_entries.put({ ...now, body: opened.body, tomorrow: opened.tomorrow })
      })
    }
  }

  /** The journal key's bytes, from any proof. Throws WrongSecretError, NoPrfError, or the browser's NotAllowedError. */
  async function openJournalKey(proof: JournalProof): Promise<JournalKeyBytes> {
    const { local } = ready()
    const row = await liveRow(local)
    if (proof.kind === 'passphrase') return openWithPassphrase(row, proof.secret)
    if (proof.kind === 'recovery') return openWithRecoveryKey(row, proof.secret)
    const passkeys = await livePasskeys(local)
    const used = await askJournalPasskey(passkeys)
    const match = passkeys.find((p) => p.credential_id === used.credentialId)!
    return unwrapJournalKey(await passkeyKey(used.prf, match.prf_salt), match.wrapped_key)
  }

  async function keepOnDevice(raw: JournalKeyBytes) {
    const { local, uid, engine: e } = ready()
    const row = await liveRow(local)
    const key = await deviceKey(raw)
    await keyringFor(local).remember(row.id, key)
    await openLocalCopies(local, uid, key)
    // Uploads the server refused while this device couldn't encrypt are tried again now.
    void e.sync().catch(() => {})
  }

  /** Turn the lock on. Returns the recovery key, to show once, and the journal key for adding a passkey straight after. */
  async function lockJournal(passphrase: string): Promise<{ recoveryKey: string; raw: JournalKeyBytes }> {
    const { engine: e, uid, local } = ready()
    const keyring = keyringFor(local)
    if (await keyring.keyRow()) throw new Error('My journal is already locked')
    const lock = await newJournalLock(passphrase)
    const row: JournalKeyRow = { id: crypto.randomUUID(), user_id: uid, ...lock.fields, deleted_at: null }
    await keyring.remember(row.id, await deviceKey(lock.raw))
    await e.save('journal_keys', row)
    await requeueWriting(e, local)
    return { recoveryKey: lock.recoveryKey, raw: lock.raw }
  }

  /** Unlock this device. */
  async function unlockJournal(proof: JournalProof) {
    await keepOnDevice(await openJournalKey(proof))
  }

  async function changeJournalPassphrase(raw: JournalKeyBytes, passphrase: string) {
    const { engine: e, local } = ready()
    const row = await liveRow(local)
    const fields = await passphraseFields(raw, passphrase)
    await e.patch('journal_keys', row.id, () => fields)
  }

  /** A new recovery key (the old one stops working). Returns it, to show once. */
  async function newJournalRecoveryKey(raw: JournalKeyBytes): Promise<string> {
    const { engine: e, local } = ready()
    const row = await liveRow(local)
    const { recoveryKey, ...fields } = await recoveryFields(raw)
    await e.patch('journal_keys', row.id, () => fields)
    return recoveryKey
  }

  /** Add a passkey that unlocks my journal. `account` names it in the device's passkey list. */
  async function addJournalPasskey(raw: JournalKeyBytes, name: string, account: string, rpName: string) {
    const { engine: e, uid } = ready()
    const prf_salt = toBase64(randomBytes(32))
    const made = await createJournalPasskey({ id: uid, name: account }, rpName, prf_salt)
    const row: JournalPasskeyRow = {
      id: crypto.randomUUID(),
      user_id: uid,
      credential_id: made.credentialId,
      name: name.trim().slice(0, 120),
      prf_salt,
      wrapped_key: await wrapJournalKey(await passkeyKey(made.prf, prf_salt), raw),
      deleted_at: null,
    }
    await e.save('journal_passkeys', row)
  }

  async function removeJournalPasskey(id: string) {
    await ready().engine.remove('journal_passkeys', id)
  }

  /** Remove the lock and its passkeys, then forget this device's key. */
  async function dropLock(e: SyncEngine, local: LocalDb) {
    await e.removeMany('journal_passkeys', (await livePasskeys(local)).map((p) => p.id))
    await e.remove('journal_keys', (await liveRow(local)).id)
    await keyringFor(local).forget()
  }

  /** Turn the lock off: every entry is uploaded readable again. */
  async function unlockJournalForGood(raw: JournalKeyBytes) {
    const { engine: e, uid, local } = ready()
    await openLocalCopies(local, uid, await deviceKey(raw))
    // The lock is removed before the plain copies upload: the server refuses plain writing while it's locked.
    await dropLock(e, local)
    await requeueWriting(e, local)
  }

  /**
   * Forgot everything: the encrypted writing is deleted on every entry (dates, stats, answers and word counts stay)
   * and the journal is locked again with a new passphrase. Returns what lockJournal returns.
   */
  async function startJournalOver(passphrase: string) {
    const { engine: e, local } = ready()
    for (const entry of live(await local.journal_entries.toArray()).filter(hasWriting)) await e.patch('journal_entries', entry.id, () => ({ body: '', tomorrow: '' }))
    await dropLock(e, local)
    return lockJournal(passphrase)
  }

  /** Journal rows (from the server, for Download my data) with their writing decrypted where this device can. */
  async function openJournalRows(rows: JournalEntryRow[]): Promise<JournalEntryRow[]> {
    const { local, uid } = ready()
    const keyring = keyringFor(local)
    const key = await keyring.key()
    return Promise.all(rows.map((r) => keyring.open(r, uid, key)))
  }

  return {
    lockJournal,
    unlockJournal,
    openJournalKey,
    changeJournalPassphrase,
    newJournalRecoveryKey,
    addJournalPasskey,
    removeJournalPasskey,
    unlockJournalForGood,
    startJournalOver,
    openJournalRows,
  }
}
