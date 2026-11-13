import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { FakeRemote } from '@/tests/support/fakeRemote'

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
    expect(await brain.db!.tasks.get(task!.row.id)).toMatchObject({ title: 'renew passport', due_date: null })
  })

  it('SPEC §5 Orphans: deleting the last orphan counts as emptying Orphans (Trophies), like filing it', async () => {
    const brain = useBrainStore()
    brain.start(`u-${crypto.randomUUID()}`, remote)
    const one = await brain.capture({ text: 'first', destination: 'later' })
    const two = await brain.capture({ text: 'second', destination: 'later' })
    const emptied = async () => (await brain.db!.activity_log.toArray()).filter((a) => a.kind === 'orphans_cleared').length

    await brain.removeOrphan(one.row.id)
    expect(await emptied()).toBe(0)
    await brain.removeOrphan(two.row.id)
    expect(await emptied()).toBe(1)
  })
})

describe('Spec §7: changes from other devices arrive through Realtime', () => {
  it('a row another device saves while the app is open reaches this device without a reload', async () => {
    const brain = useBrainStore()
    brain.start(`u-${crypto.randomUUID()}`, remote)
    await vi.waitFor(() => expect(brain.syncedCount).toBe(1))

    remote.writeFromOtherDevice('quests', { id: 'q1', title: 'learn to juggle', status: 'open', deleted_at: null })
    remote.writeFromOtherDevice('quests', { id: 'q1', title: 'learn to juggle three balls', status: 'open', deleted_at: null })
    await vi.waitFor(() => expect(brain.db!.quests.get('q1')).resolves.toMatchObject({ title: 'learn to juggle three balls' }), { timeout: 3000 })
  })
})

describe('Spec §5 Habits: misses are never invented on a device that has not downloaded the history', () => {
  it('a fresh device waits for the habit history before recording misses', async () => {
    const habit = { id: '3f2b6c1e-9a7d-4c2e-8b1a-0f9e8d7c6b5a', title: 'Walk', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null }
    remote.writeFromOtherDevice('habits', habit)
    for (const date of ['2026-11-01', '2026-11-02', '2026-11-03']) {
      remote.writeFromOtherDevice('habit_logs', { id: `log-${date}`, habit_id: habit.id, date, status: 'completed', completed_at: `${date}T15:00:00Z`, deleted_at: null })
    }
    const brain = useBrainStore()
    brain.start(`u-${crypto.randomUUID()}`, remote)
    const now = new Date('2026-11-04T01:00:00Z') // Nov 3, 8 pm in New York

    await brain.refreshHabit(habit, now, 'America/New_York') // before the download finishes: must do nothing
    expect([...remote.tables.habit_logs.values()].filter((l) => l.status === 'missed')).toEqual([])

    await vi.waitFor(() => expect(brain.habitsReady).toBe(true))
    await brain.refreshHabit(habit, now, 'America/New_York')
    expect([...remote.tables.habit_logs.values()].filter((l) => l.status === 'missed')).toEqual([])
    expect((await brain.db!.habits.get(habit.id))?.current_streak).toBe(3)
  })
})

describe('Spec §5 Journal: one entry per day, even when saves happen at once', () => {
  it('writing, the tomorrow box and two quick Yes/No taps all land in a single entry, in order', async () => {
    const brain = useBrainStore()
    brain.start(`u-${crypto.randomUUID()}`, remote)
    const now = new Date('2026-11-10T15:00:00Z')
    await Promise.all([
      brain.saveJournalBody('2026-11-10', '<p>A good day</p>', now, 'UTC'),
      brain.saveJournalFields('2026-11-10', { tomorrow: '<p>Sleep early</p>' }, now, 'UTC'),
      brain.saveJournalFields('2026-11-10', { better_than_yesterday: true }, now, 'UTC'),
      brain.saveJournalFields('2026-11-10', { better_than_yesterday: false }, now, 'UTC'),
    ])
    const entries = (await brain.db!.journal_entries.where('date').equals('2026-11-10').toArray()).filter((e) => !e.deleted_at)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ body: '<p>A good day</p>', tomorrow: '<p>Sleep early</p>', better_than_yesterday: false })
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
