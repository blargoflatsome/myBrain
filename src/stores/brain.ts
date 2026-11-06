// The signed-in user's data: on-device store, sync engine, and the actions screens use (SPEC §5, §7).
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { LocalDb } from '@/sync/db'
import { SyncEngine } from '@/sync/engine'
import type { QuestRow, Remote, SyncStatus, TaskRow } from '@/sync/types'
import { DEFAULT_PRIORITY } from '@/tasks/rules'
import { buildBucket, buildCaptureRecord, buildConversion, type CaptureInput, type CaptureRecord } from '@/capture/capture'

/** Run sync work in the background. A store closed by sign-out mid-sync is expected and ignored. */
function background(work: Promise<unknown> | undefined) {
  work?.catch((err: unknown) => {
    if ((err as { name?: string })?.name === 'DatabaseClosedError') return
    console.error(err)
  })
}

export const useBrainStore = defineStore('brain', () => {
  const db = shallowRef<LocalDb | null>(null)
  const engine = shallowRef<SyncEngine | null>(null)
  const userId = ref<string | null>(null)
  const status = ref<SyncStatus>({ state: 'synced', pending: 0 })
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  let cleanup: (() => void) | null = null

  /** Open this user's on-device store and start syncing. One store per user, so accounts never mix. */
  function start(uid: string, remote: Remote) {
    if (userId.value === uid) return
    stop()
    userId.value = uid
    db.value = new LocalDb(`my-brain-${uid}`)
    engine.value = new SyncEngine(db.value, remote, (s) => (status.value = s), () => online.value)

    const goOnline = () => {
      online.value = true
      background(engine.value?.sync())
    }
    const goOffline = () => {
      online.value = false
      background(engine.value?.flush())
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const unsubscribe = remote.subscribe((table) => background(engine.value?.pull([table])))
    cleanup = () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      unsubscribe()
    }
    background(engine.value.sync())
  }

  function stop() {
    cleanup?.()
    cleanup = null
    db.value?.close()
    db.value = null
    engine.value = null
    userId.value = null
  }

  function requireReady() {
    if (!engine.value || !userId.value || !db.value) throw new Error('Not signed in')
    return { engine: engine.value, uid: userId.value, local: db.value }
  }

  /** Save a captured thought. Resolves once it is stored on this device, online or not. */
  async function capture(input: CaptureInput): Promise<CaptureRecord> {
    const { engine: e, uid } = requireReady()
    const record = buildCaptureRecord(input, uid)
    await e.save(record.table, record.row as never)
    return record
  }

  async function createBucket(name: string) {
    const { engine: e, uid, local } = requireReady()
    const last = await local.vault_buckets.orderBy('position').last()
    const bucket = buildBucket(name, (last?.position ?? -1) + 1, uid)
    await e.save('vault_buckets', bucket)
    return bucket
  }

  /** Convert an item to another type, or file an inbox item (SPEC §5). */
  async function convert(from: CaptureRecord, to: Omit<CaptureInput, 'text'>) {
    const { engine: e, uid } = requireReady()
    const { create, retire } = buildConversion(from, to, uid)
    await e.save(create.table, create.row as never)
    await e.remove(retire.table, retire.id)
    return create
  }

  /** Add a task typed on the Tasks screen (source "manual", default priority Low). */
  async function addTask(title: string, dueDate: string | null) {
    const { engine: e, uid } = requireReady()
    const trimmed = title.trim()
    if (!trimmed) return null
    const row: TaskRow = {
      id: crypto.randomUUID(),
      user_id: uid,
      title: trimmed,
      due_date: dueDate,
      priority: DEFAULT_PRIORITY,
      status: 'open',
      source: 'manual',
      deleted_at: null,
    }
    return e.save('tasks', row)
  }

  async function saveTask(row: TaskRow) {
    return requireReady().engine.save('tasks', row)
  }

  async function deleteTask(id: string) {
    await requireReady().engine.remove('tasks', id)
  }

  async function addQuest(title: string) {
    const { engine: e, uid } = requireReady()
    const trimmed = title.trim()
    if (!trimmed) return null
    const row: QuestRow = { id: crypto.randomUUID(), user_id: uid, title: trimmed, status: 'open', times_picked: 0, deleted_at: null }
    return e.save('quests', row)
  }

  async function saveQuest(row: QuestRow) {
    return requireReady().engine.save('quests', row)
  }

  async function deleteQuest(id: string) {
    await requireReady().engine.remove('quests', id)
  }

  return {
    db,
    status,
    online,
    userId,
    start,
    stop,
    capture,
    createBucket,
    convert,
    addTask,
    saveTask,
    deleteTask,
    addQuest,
    saveQuest,
    deleteQuest,
  }
})
