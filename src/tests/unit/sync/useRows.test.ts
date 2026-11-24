import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useBrainStore } from '@/stores/brain'
import { readTables } from '@/sync/db'
import { useRow, useRows } from '@/sync/useRows'
import type { TaskRow } from '@/sync/types'
import { FakeRemote } from '@/tests/support/fakeRemote'

const task = (title: string, deleted = false): TaskRow => ({
  id: crypto.randomUUID(), title, due_date: null, status: 'open', source: 'manual', deleted_at: deleted ? '2026-11-20T10:00:00Z' : null,
})

let scope: EffectScope
let remote: FakeRemote
beforeEach(() => {
  setActivePinia(createPinia())
  remote = new FakeRemote()
  remote.online = false
  scope = effectScope()
})
afterEach(async () => {
  scope.stop()
  const brain = useBrainStore()
  const db = brain.db
  brain.stop()
  await db?.delete()
})

/** Start a fresh signed-in device holding these tasks. */
async function signIn(tasks: TaskRow[]) {
  const brain = useBrainStore()
  brain.online = false
  brain.start(`u-${crypto.randomUUID()}`, remote)
  await brain.db!.tasks.bulkPut(tasks)
  return brain
}
const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort()

describe('CODING_STANDARDS §9: deleted rows are hidden unless asked for', () => {
  it('a page sees my live rows only; a reader that asks for deleted rows gets them too', async () => {
    await signIn([task('Stamps'), task('Old', true)])
    const [rows, all] = scope.run(() => [useRows('tasks'), useRows('tasks', [], { includeDeleted: true })])!
    await vi.waitFor(() => expect(titles(all.value)).toEqual(['Old', 'Stamps']))
    expect(titles(rows.value)).toEqual(['Stamps'])
  })

  it('one-off reads hide deleted rows too, except in the tables a reader names', async () => {
    const brain = await signIn([task('Stamps'), task('Old', true)])
    expect(titles((await readTables(brain.db!, { tasks: 'tasks' })).tasks)).toEqual(['Stamps'])
    expect(titles((await readTables(brain.db!, { tasks: 'tasks' }, { includeDeleted: ['tasks'] })).tasks)).toEqual(['Old', 'Stamps'])
  })

  it('SPEC §5 Routines: a deleted row read by id is not found, so its page says it is gone', async () => {
    const gone = task('Old', true)
    await signIn([gone])
    const row = scope.run(() => useRow('tasks', gone.id))!
    await vi.waitFor(() => expect(row.value).toBeUndefined())
  })
})

describe('SPEC §7: screens read the device copy of my data, for whoever is signed in', () => {
  it('signed out reads nothing; signing in as someone else shows their rows, not mine', async () => {
    const rows = scope.run(() => useRows('tasks'))!
    expect(rows.value).toEqual([])
    await signIn([task('Mine')])
    await vi.waitFor(() => expect(titles(rows.value)).toEqual(['Mine']))
    await signIn([task('Theirs')])
    await vi.waitFor(() => expect(titles(rows.value)).toEqual(['Theirs']))
  })
})
