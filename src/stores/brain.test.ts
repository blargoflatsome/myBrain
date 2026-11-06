import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from './brain'
import { FakeRemote } from '@/sync/fakeRemote'

let remote: FakeRemote

beforeEach(() => {
  setActivePinia(createPinia())
  remote = new FakeRemote()
})

afterEach(async () => {
  const brain = useBrainStore()
  const db = brain.db
  brain.stop()
  await db?.delete()
})

describe('Spec §5 Quick capture: works offline; items are queued and synced later', () => {
  it('a capture made offline is on the device at once and reaches the server when back online', async () => {
    const brain = useBrainStore()
    brain.online = false
    remote.online = false
    brain.start(`u-${crypto.randomUUID()}`, remote)

    const rec = await brain.capture({ text: 'idea for a song', destination: 'later' })
    expect(await brain.db!.inbox.get(rec.row.id)).toMatchObject({ body: 'idea for a song' })
    expect(remote.tables.inbox.size).toBe(0)

    remote.online = true
    window.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 50))
    expect(remote.tables.inbox.get(rec.row.id)).toMatchObject({ body: 'idea for a song' })
  })
})

describe('Spec §5: Decide later, then sort it when I have time', () => {
  it('filing an inbox item into a task removes it from the inbox (soft delete) and creates the task', async () => {
    const brain = useBrainStore()
    brain.start(`u-${crypto.randomUUID()}`, remote)
    const later = await brain.capture({ text: 'renew passport', destination: 'later' })
    const task = await brain.convert(later, { destination: 'task' })

    expect((await brain.db!.inbox.get(later.row.id))?.deleted_at).toBeTruthy()
    expect(await brain.db!.tasks.get(task.row.id)).toMatchObject({ title: 'renew passport', due_date: null })
  })
})

describe('Spec §5 The Vault: bucket picker can create a new bucket', () => {
  it('a new bucket goes after the existing ones', async () => {
    const brain = useBrainStore()
    brain.start(`u-${crypto.randomUUID()}`, remote)
    const first = await brain.createBucket('Books')
    const second = await brain.createBucket('Shows')
    expect(second.position).toBe(first.position + 1)
  })
})
