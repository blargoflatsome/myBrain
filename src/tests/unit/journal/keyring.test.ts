import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalDb } from '@/sync/db'
import { JournalKeyring } from '@/journal/keyring'
import type { JournalKeyRow } from '@/sync/types'

let db: LocalDb

afterEach(async () => {
  await db?.delete()
})

const lockRow = (id: string, deleted = false) => ({ id, user_id: 'u1', deleted_at: deleted ? '2026-11-20T00:00:00Z' : null }) as JournalKeyRow
const newKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) as Promise<CryptoKey>

describe('SPEC §5 Locking my journal: this device is unlocked only for the current lock', () => {
  it('a key kept from an earlier lock leaves the device locked after the lock is turned off and on again elsewhere', async () => {
    db = new LocalDb(`keyring-${crypto.randomUUID()}`)
    const keyring = new JournalKeyring(db)
    expect(await keyring.state()).toEqual({ on: false, unlocked: false })

    await db.journal_keys.put(lockRow('lock-1'))
    await keyring.remember('lock-1', await newKey())
    expect(await keyring.state()).toEqual({ on: true, unlocked: true })

    // Another device turned the lock off and on again: a new lock, while this device still holds the old key.
    await db.journal_keys.put(lockRow('lock-1', true))
    await db.journal_keys.put(lockRow('lock-2'))
    expect(await keyring.state()).toEqual({ on: true, unlocked: false })
    expect(await keyring.key()).toBeNull()
  })
})
