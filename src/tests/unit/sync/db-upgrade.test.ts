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

// SPEC §5 Global search and tags: tags are on tasks, habits and routines only. The server deleted the other links
// outright, so a device still had them, and renaming or merging a tag queued an upload the server always refused.
describe('SPEC §5 Tags: only tasks, habits and routines carry tags on this device too', () => {
  it('upgrading the device database removes other tag links and their waiting uploads', async () => {
    const name = 'upgrade-tags-test'
    const old = new Dexie(name)
    old.version(18).stores({ item_tags: 'id, updated_at, item_id, tag_id', outbox: '++seq, table, rowId' })
    const journalLink = { id: 'l1', tag_id: 't1', item_type: 'journal_entry', item_id: 'j1', deleted_at: null }
    const taskLink = { id: 'l2', tag_id: 't1', item_type: 'task', item_id: 'k1', deleted_at: null }
    await old.table('item_tags').bulkPut([journalLink, taskLink])
    await old.table('outbox').bulkAdd([
      { table: 'item_tags', rowId: 'l3', row: { ...journalLink, id: 'l3', tag_id: 't2' } },
      { table: 'item_tags', rowId: 'l4', row: { ...taskLink, id: 'l4', tag_id: 't2' } },
    ])
    old.close()

    const db = new LocalDb(name)
    await db.open()
    expect((await db.item_tags.toArray()).map((l) => l.id)).toEqual(['l2'])
    expect((await db.outbox.toArray()).map((e) => e.rowId)).toEqual(['l4'])
    db.close()
  })
})
