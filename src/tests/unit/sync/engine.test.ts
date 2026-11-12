import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalDb } from '@/sync/db'
import { SyncEngine } from '@/sync/engine'
import { FakeRemote } from '../../support/fakeRemote'
import type { SyncStatus, TaskRow } from '@/sync/types'

let db: LocalDb
let remote: FakeRemote
let engine: SyncEngine
let statuses: SyncStatus[]

function task(id: string, title: string): TaskRow {
  return { id, title, due_date: null, status: 'open', source: 'capture', deleted_at: null }
}

beforeEach(() => {
  db = new LocalDb(`test-${crypto.randomUUID()}`)
  remote = new FakeRemote()
  statuses = []
  engine = new SyncEngine(db, remote, (s) => statuses.push(s), () => remote.online)
})

afterEach(async () => {
  await db.delete()
})

describe('Spec §2/§7: capturing works offline and syncs later', () => {
  it('saves to the device and queues the change when offline', async () => {
    remote.online = false
    await engine.save('tasks', task('t1', 'buy milk'))
    await engine.flush()

    expect(await db.tasks.get('t1')).toMatchObject({ title: 'buy milk' })
    expect(await db.outbox.count()).toBe(1)
    expect(remote.tables.tasks.size).toBe(0)
    expect(engine.getStatus()).toEqual({ state: 'offline', pending: 1 })
  })

  it('uploads queued changes once back online', async () => {
    remote.online = false
    await engine.save('tasks', task('t1', 'buy milk'))
    await engine.flush()

    remote.online = true
    await engine.sync()

    expect(remote.tables.tasks.get('t1')).toMatchObject({ title: 'buy milk' })
    expect(await db.outbox.count()).toBe(0)
    expect(engine.getStatus()).toEqual({ state: 'synced', pending: 0 })
  })

  it('uploads queued changes in the order they were made', async () => {
    remote.online = false
    await engine.save('vault_buckets', { id: 'b1', name: 'Books', position: 3, deleted_at: null })
    await engine.save('vault_items', { id: 'i1', bucket_id: 'b1', title: 'Dune', deleted_at: null })
    remote.online = true

    const order: string[] = []
    const upsert = remote.upsert.bind(remote)
    remote.upsert = (async (table, row) => {
      order.push(table)
      return upsert(table, row)
    }) as typeof remote.upsert
    await engine.flush()

    expect(order).toEqual(['vault_buckets', 'vault_items'])
  })

  it('keeps the rest of the queue when the connection drops mid-upload', async () => {
    remote.online = false
    await engine.save('tasks', task('t1', 'one'))
    await engine.save('tasks', task('t2', 'two'))
    remote.online = true
    let calls = 0
    const upsert = remote.upsert.bind(remote)
    remote.upsert = (async (table, row) => {
      calls += 1
      if (calls === 2) remote.online = false
      return upsert(table, row)
    }) as typeof remote.upsert
    await engine.flush()

    expect(remote.tables.tasks.has('t1')).toBe(true)
    expect(remote.tables.tasks.has('t2')).toBe(false)
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('Spec §7: anything a screen hands over can be saved', () => {
  it('saves rows that are Vue reactive objects with lists inside (e.g. habit weekdays)', async () => {
    const { reactive } = await import('vue')
    const habit = reactive({
      id: 'h1',
      title: 'Stretch',
      weekdays: [1, 2, 3],
      start_date: '2026-11-10',
      is_private: false,
      deleted_at: null,
    })
    await engine.save('habits', habit)
    expect(await db.habits.get('h1')).toMatchObject({ weekdays: [1, 2, 3] })
  })
})

describe('Spec §7: background updates never overwrite an edit', () => {
  it('patch changes only the given fields of the latest stored copy', async () => {
    await engine.save('habits', { id: 'h1', title: 'Stretch', weekdays: [1], start_date: '2026-11-10', is_private: false, is_priority: false, deleted_at: null })
    await engine.save('habits', { id: 'h1', title: 'Stretch', weekdays: [1], start_date: '2026-11-10', is_private: false, is_priority: true, deleted_at: null })
    await engine.patch('habits', 'h1', () => ({ current_streak: 4 }))
    expect(await db.habits.get('h1')).toMatchObject({ is_priority: true, current_streak: 4 })
  })

  it('patch saves nothing when there is nothing to change', async () => {
    await engine.save('habits', { id: 'h2', title: 'Read', weekdays: [1], start_date: '2026-11-10', is_private: false, deleted_at: null })
    await engine.flush()
    expect(await engine.patch('habits', 'h2', () => null)).toBe(false)
    expect(await db.outbox.count()).toBe(0)
  })

  it('a pull that started before my latest change uploaded never brings back the older copy', async () => {
    await engine.save('tasks', task('t9', 'first'))
    await engine.flush()
    const stale = await remote.pullSince('tasks', null)
    // The download is in flight while I change the task again and the change uploads.
    remote.pullSince = (async () => {
      await engine.save('tasks', task('t9', 'second'))
      await engine.flush()
      return stale
    }) as typeof remote.pullSince
    await engine.pull(['tasks'])
    expect(await db.tasks.get('t9')).toMatchObject({ title: 'second' })
  })
})

describe('Spec §7: retried uploads never create duplicates', () => {
  it('sending the same change twice leaves one row on the server', async () => {
    await engine.save('tasks', task('t1', 'first'))
    await engine.flush()
    await engine.save('tasks', { ...task('t1', 'edited'), status: 'open' })
    await engine.flush()

    expect(remote.tables.tasks.size).toBe(1)
    expect(remote.tables.tasks.get('t1')?.title).toBe('edited')
  })
})

describe('Spec §4/§7: updated_at is set by the server', () => {
  it('stores the server timestamps on the device after upload', async () => {
    await engine.save('tasks', task('t1', 'x'))
    await engine.flush()
    const local = await db.tasks.get('t1')
    expect(local?.updated_at).toBe(remote.tables.tasks.get('t1')?.updated_at)
    expect(local?.updated_at).toMatch(/^2026-11-06T12:00/)
  })
})

describe('Spec §7: deletions are soft deletes that sync to other devices', () => {
  it('removing a row sets deleted_at and uploads it instead of erasing it', async () => {
    await engine.save('tasks', task('t1', 'x'))
    await engine.flush()
    await engine.remove('tasks', 't1')
    await engine.flush()

    expect((await db.tasks.get('t1'))?.deleted_at).toBeTruthy()
    expect(remote.tables.tasks.get('t1')?.deleted_at).toBeTruthy()
  })
})

describe('Spec §7: changes from other devices arrive by pull and Realtime', () => {
  it('pulls rows another device created', async () => {
    remote.writeFromOtherDevice('quests', { id: 'q1', title: 'learn to juggle', status: 'open', deleted_at: null })
    await engine.pull()
    expect(await db.quests.get('q1')).toMatchObject({ title: 'learn to juggle' })
  })

  it('only asks for rows changed since the last pull', async () => {
    remote.writeFromOtherDevice('inbox', { id: 'n1', body: 'one', deleted_at: null })
    await engine.pull()
    const seen: (string | null)[] = []
    const pullSince = remote.pullSince.bind(remote)
    remote.pullSince = (async (table, since) => {
      if (table === 'inbox') seen.push(since)
      return pullSince(table, since)
    }) as typeof remote.pullSince
    await engine.pull()
    expect(seen[0]).toBe(remote.tables.inbox.get('n1')?.updated_at)
  })

  it('does not overwrite a row that still has changes waiting to upload on this device', async () => {
    remote.writeFromOtherDevice('tasks', task('t1', 'from laptop'))
    remote.online = false
    await engine.save('tasks', task('t1', 'from phone, offline'))
    remote.online = true
    await engine.pull()
    expect((await db.tasks.get('t1'))?.title).toBe('from phone, offline')
  })

  it('the last edit to reach the server wins', async () => {
    remote.writeFromOtherDevice('tasks', task('t1', 'from laptop'))
    remote.online = false
    await engine.save('tasks', task('t1', 'older phone edit'))
    remote.online = true
    await engine.sync()
    expect(remote.tables.tasks.get('t1')?.title).toBe('older phone edit')
    expect((await db.tasks.get('t1'))?.title).toBe('older phone edit')
  })
})

describe('Spec §7: small online/offline/syncing indicator', () => {
  it('reports pending changes, syncing, and synced', async () => {
    await engine.save('tasks', task('t1', 'x'))
    await engine.flush()
    expect(statuses.some((s) => s.pending === 1)).toBe(true)
    expect(statuses.some((s) => s.state === 'syncing')).toBe(true)
    expect(statuses.at(-1)).toEqual({ state: 'synced', pending: 0 })
  })

  it('a change the server refused is retried on the next sync, so captures are never stranded', async () => {
    remote.rejectNext = 'relation "public.inbox" does not exist'
    await engine.save('inbox', { id: 'n1', body: 'saved before the table existed', deleted_at: null })
    await engine.flush()
    expect(engine.getStatus().state).toBe('error')
    expect(remote.tables.inbox.has('n1')).toBe(false)

    await engine.sync() // e.g. next app start, after the migration is applied
    expect(remote.tables.inbox.get('n1')?.body).toBe('saved before the table existed')
    expect(engine.getStatus()).toEqual({ state: 'synced', pending: 0 })
  })

  it('reports an error and keeps going when the server refuses one change', async () => {
    remote.rejectNext = 'violates row-level security policy'
    await engine.save('tasks', task('bad', 'x'))
    await engine.save('tasks', task('good', 'y'))
    await engine.flush()
    expect(remote.tables.tasks.has('good')).toBe(true)
    expect(engine.getStatus().state).toBe('error')
    expect((await db.outbox.toArray())[0]?.error).toMatch(/row-level security/)
  })
})

describe('Spec §5 Shared events: invitations change only through server functions', () => {
  it('the device refuses to write an invitation directly', async () => {
    const invite = { id: 'i1', user_id: 'u', event_id: 'e1', response: 'yes', deleted_at: null } as never
    await expect(engine.save('event_invites', invite)).rejects.toThrow(/read-only/)
    await expect(engine.patch('event_invites', 'i1', () => ({}))).rejects.toThrow(/read-only/)
    expect(await db.outbox.count()).toBe(0)
  })
})
