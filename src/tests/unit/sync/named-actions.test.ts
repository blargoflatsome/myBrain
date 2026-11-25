import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { FakeRemote } from '@/tests/support/fakeRemote'
import { live } from '@/sync/live'

// Rules that used to live in screens, now in each kind's actions (architecture review 3, candidate 3).
type Brain = ReturnType<typeof useBrainStore>
let remote: FakeRemote
let uid: string

beforeEach(() => {
  setActivePinia(createPinia())
  remote = new FakeRemote()
  uid = `u-${crypto.randomUUID()}`
})

afterEach(async () => {
  const brain = useBrainStore()
  const db = brain.db
  brain.stop()
  await db?.delete()
})

function started(): Brain {
  const brain = useBrainStore()
  brain.start(uid, remote)
  return brain
}

describe('SPEC §5 Shared Vaults: stars are per person', () => {
  it('starring a bucket shared with me stars it for me only; the owner’s bucket is left as it is', async () => {
    const bucket = { id: crypto.randomUUID(), user_id: 'u-owner', name: 'Hikes', position: 0, starred: false, deleted_at: null }
    remote.writeFromOtherDevice('vault_buckets', bucket)
    remote.writeFromOtherDevice('vault_shares', { id: crypto.randomUUID(), user_id: 'u-owner', bucket_id: bucket.id, member: uid, deleted_at: null })
    const brain = started()
    await vi.waitFor(async () => expect(await brain.db!.vault_buckets.get(bucket.id)).toBeTruthy())

    await brain.toggleStar(bucket.id)
    const myStars = async () => live(await brain.db!.vault_stars.toArray()).filter((s) => s.starred !== false)
    expect(await myStars()).toMatchObject([{ bucket_id: bucket.id, user_id: uid }])
    expect(await brain.db!.vault_buckets.get(bucket.id)).toMatchObject({ starred: false })

    await brain.toggleStar(bucket.id)
    expect(await myStars()).toEqual([])
  })
})

describe('SPEC §5 Habits: editing a habit', () => {
  it('changing its days works the streak out again', async () => {
    const brain = started()
    await vi.waitFor(() => expect(brain.habitsReady).toBe(true))
    const now = new Date('2026-11-12T12:00:00Z') // a Thursday
    const habit = (await brain.addHabit({ title: 'Walk', start_date: '2026-11-09', weekdays: [1, 2, 3] }, new Date('2026-11-09T12:00:00Z'), 'UTC'))!
    for (const date of ['2026-11-09', '2026-11-10', '2026-11-11']) {
      await brain.toggleHabit({ ...habit }, new Date(`${date}T12:00:00Z`), 'UTC')
    }
    await brain.refreshHabit(habit, now, 'UTC')
    expect((await brain.db!.habits.get(habit.id))?.current_streak).toBe(3)

    // Mondays and Tuesdays only now: Wednesday's walk no longer counts toward the streak.
    await brain.saveHabit({ ...(await brain.db!.habits.get(habit.id))!, weekdays: [1, 2] }, undefined, now, 'UTC')
    expect((await brain.db!.habits.get(habit.id))?.current_streak).toBe(2)
  })
})

describe('SPEC §5 Calendar, Contacts: someone is saved once', () => {
  it('saving a person with an email someone is already saved under is refused, naming who', async () => {
    const brain = started()
    const ana = await brain.savePerson({ id: crypto.randomUUID(), user_id: uid, name: 'Ana', email: 'ana@example.com', phone: null, deleted_at: null })
    const again = await brain.savePerson({ id: crypto.randomUUID(), user_id: uid, name: 'A', email: ' ANA@example.com ', phone: null, deleted_at: null })
    expect(again).toEqual({ twin: 'saved' in ana ? ana.saved : null })
    expect(live(await brain.db!.people.toArray())).toHaveLength(1)
  })
})

describe('SPEC §5 Global search and tags: tags are saved with their item', () => {
  it.each([
    { kind: 'a new task', save: (b: Brain) => b.addTask({ title: 'Stamps', source: 'manual', tags: ['errands'] }).then((t) => t!.id) },
    { kind: 'an edited task', save: async (b: Brain) => { const t = (await b.addTask({ title: 'Stamps', source: 'manual' }))!; await b.saveTask(t, ['errands']); return t.id } },
    { kind: 'a new habit', save: (b: Brain) => b.addHabit({ title: 'Walk', tags: ['errands'] }).then((h) => h!.id) },
  ])('$kind', async ({ save }) => {
    const brain = started()
    const id = await save(brain)
    const tags = live(await brain.db!.tags.toArray())
    const links = live(await brain.db!.item_tags.where('item_id').equals(id).toArray())
    expect(tags.map((t) => t.name)).toEqual(['errands'])
    expect(links.map((l) => l.tag_id)).toEqual([tags[0].id])
  })
})
