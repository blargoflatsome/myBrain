import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { FakeRemote } from '@/tests/support/fakeRemote'
import { CaptureError, type CaptureInput } from '@/capture/capture'

type Brain = ReturnType<typeof useBrainStore>
const NOW = new Date('2026-11-12T12:00:00Z')
let remote: FakeRemote
let bucketId: string

beforeEach(async () => {
  setActivePinia(createPinia())
  remote = new FakeRemote()
  const brain = useBrainStore()
  brain.start(`u-${crypto.randomUUID()}`, remote)
  bucketId = (await brain.createBucket('Places')).id
})

afterEach(async () => {
  const brain = useBrainStore()
  const db = brain.db
  brain.stop()
  await db?.delete()
})

/** A row as saved, without what is different every time (its id) or says where it came from. */
async function saved(brain: Brain, table: 'tasks' | 'vault_items' | 'quests' | 'habits', id: string) {
  const row = { ...((await brain.db![table].get(id)) as unknown as Record<string, unknown>) }
  delete row.id
  delete row.source
  return row
}

describe('SPEC §5 Quick capture: a captured item is the same as one added on its own page', () => {
  it.each([
    {
      kind: 'task',
      table: 'tasks',
      capture: { destination: 'task', text: 'dentist', notes: 'bring the card', dueDate: '2026-11-13', priority: 3, reminderTime: '09:00' },
      add: (b: Brain) => b.addTask({ title: 'dentist', notes: 'bring the card', due_date: '2026-11-13', priority: 3, reminder_time: '09:00', source: 'manual' }, NOW),
    },
    {
      kind: 'Vault item',
      table: 'vault_items',
      capture: { destination: 'vault', text: 'Thai Garden', notes: 'try the curry', rating: 4, link: 'https://example.com', bucketId: '' },
      add: (b: Brain) => b.addVaultItem(bucketId, { title: 'Thai Garden', notes: 'try the curry', rating: 4, link: 'https://example.com' }, NOW),
    },
    {
      kind: 'quest (Ugh and 30 min unless changed)',
      table: 'quests',
      capture: { destination: 'quest', text: 'kayak the river' },
      add: (b: Brain) => b.addQuest({ title: 'kayak the river' }, NOW),
    },
    {
      kind: 'habit (weekdays in order; a timer needs a reminder time)',
      table: 'habits',
      capture: { destination: 'habit', text: 'Stretch', habit: { weekdays: [5, 1, 3], weekInterval: 2, notifyTime: null, timerMinutes: 30, isPriority: true } },
      add: (b: Brain) => b.addHabit({ title: 'Stretch', weekdays: [5, 1, 3], week_interval: 2, notify_time: null, timer_minutes: 30, is_priority: true }, NOW),
    },
  ] as const)('$kind', async ({ table, capture, add }) => {
    const brain = useBrainStore()
    const input = { ...capture, ...('bucketId' in capture ? { bucketId } : {}) } as CaptureInput
    const captured = await brain.capture(input, NOW)
    const added = await add(brain)

    const row = await saved(brain, table, captured.id)
    expect(row).toEqual(await saved(brain, table, added!.id))
    // Set on the device, so it keeps its place in the list before it reaches the server.
    expect(row.created_at).toBe(NOW.toISOString())
  })

  it('a captured habit gets the habit rules: weekdays in order, no timer without a reminder time', async () => {
    const brain = useBrainStore()
    const { id } = await brain.capture({ destination: 'habit', text: 'Stretch', habit: { weekdays: [5, 1, 3], weekInterval: 1, notifyTime: null, timerMinutes: 30, isPriority: false } }, NOW)
    expect(await brain.db!.habits.get(id)).toMatchObject({ weekdays: [1, 3, 5], timer_minutes: null })
  })

  it.each([
    { why: 'empty', input: { destination: 'later', text: '   ' } },
    { why: 'empty', input: { destination: 'postit', text: '<p> </p>' } },
    { why: 'bucket', input: { destination: 'vault', text: 'oat milk' } },
    { why: 'reminder', input: { destination: 'task', text: 'call', dueDate: '2026-11-01', priority: 3, reminderTime: '00:00' } },
  ] as const)('refuses to save, saying why: $why', async ({ why, input }) => {
    const brain = useBrainStore()
    await expect(brain.capture(input as CaptureInput, NOW)).rejects.toMatchObject(new CaptureError(why))
    await expect(brain.capture(input as CaptureInput, NOW)).rejects.toHaveProperty('reason', why)
  })
})
