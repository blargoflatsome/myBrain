import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { LocalDb } from '@/sync/db'

// SPEC §4 habits: the server dropped is_private (2026-11-12). Copies on a device, and changes waiting to upload,
// lose it too, so an upload never names a column that no longer exists (it would be refused on every retry).
describe('SPEC §4: habits.is_private is gone from this device too', () => {
  it('upgrading the device database removes it from stored habits and waiting uploads', async () => {
    const name = 'upgrade-test'
    const old = new Dexie(name)
    old.version(14).stores({ habits: 'id, updated_at', outbox: '++seq, table, rowId' })
    await old.table('habits').put({ id: 'h1', title: 'Run', is_private: true })
    await old.table('outbox').add({ table: 'habits', rowId: 'h1', row: { id: 'h1', title: 'Run', is_private: true } })
    old.close()

    const db = new LocalDb(name)
    await db.open()
    expect(await db.habits.get('h1')).toEqual({ id: 'h1', title: 'Run' })
    expect((await db.outbox.toArray())[0]!.row).toEqual({ id: 'h1', title: 'Run' })
    db.close()
  })
})
