// The signed-in user's data (SPEC §5, §7): opens the on-device store and starts and stops syncing, then hands out
// every feature's actions (src/<feature>/actions.ts) so screens import one store and every write goes through the
// sync queue.
import { defineStore } from 'pinia'
import Dexie from 'dexie'
import { ref, shallowRef } from 'vue'
import { LocalDb } from '@/sync/db'
import { SyncEngine } from '@/sync/engine'
import type { EventRow, PostItColor, PostItRow, QuestRow, Remote, RowTypes, SyncStatus, SyncTable, TaskRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { habitActions } from '@/habits/actions'
import { routineActions } from '@/routines/actions'
import { journalActions } from '@/journal/actions'
import { tagActions } from '@/tags/actions'
import { trophyActions } from '@/trophies/actions'
import { vaultActions } from '@/vault/actions'
import { priorityActions } from '@/reminders/actions'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { DEFAULT_PRIORITY } from '@/tasks/rules'
import { normalizeBody, toEditorHtml } from '@/journal/body'
import { DEFAULT_POST_IT_COLOR, frontPosition } from '@/postits/rules'
import { peopleToSave } from '@/events/people'
import type { PersonToInvite } from '@/events/sharing'
import { live } from '@/sync/live'
import { finishQuest as finishedQuest } from '@/quests/picker'
import { buildCaptureRecord, buildConversion, textOf, type CaptureInput, type CaptureRecord } from '@/capture/capture'
import { achieved } from '@/celebrate/bus'

/** Run sync work in the background. A store closed by sign-out mid-sync is expected and ignored. */
function background(work: Promise<unknown> | undefined) {
  work?.catch((err: unknown) => {
    if ((err as { name?: string })?.name === 'DatabaseClosedError') return
    console.error(err)
  })
}

/** How often queued changes are retried while the app is open (SPEC §7). */
const RETRY_MS = 30_000
/**
 * How long a table waits after a Realtime change before downloading. Each of my own saves comes back as a change too,
 * so several saves in a row (writing in the journal) download once, not once each.
 */
const REALTIME_WAIT_MS = 500

export const useBrainStore = defineStore('brain', () => {
  const db = shallowRef<LocalDb | null>(null)
  const engine = shallowRef<SyncEngine | null>(null)
  const userId = ref<string | null>(null)
  const status = ref<SyncStatus>({ state: 'synced', pending: 0 })
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  /**
   * True once this device holds the server's habit history (after a first full download, now or in an earlier
   * session). Misses are only recorded after that, so a fresh device never mistakes "not downloaded yet" for "missed".
   */
  const habitsReady = ref(false)
  // Counts finished downloads this session, so checks that need my latest data can run again once it's here.
  const syncedCount = ref(0)
  /** True once this device holds my badges from the server, so a badge I already have is never earned again. */
  const badgesReady = ref(false)
  let cleanup: (() => void) | null = null
  let lastRemote: Remote | null = null

  /** Open this user's on-device store and start syncing. One store per user, so accounts never mix. */
  function start(uid: string, remote: Remote) {
    if (userId.value === uid) return
    stop()
    lastRemote = remote
    userId.value = uid
    db.value = new LocalDb(`my-brain-${uid}`)
    engine.value = new SyncEngine(db.value, remote, (s) => (status.value = s), () => online.value)

    const local = db.value
    const markReady = async () => {
      if (await local.meta.get('downloaded:badges')) badgesReady.value = true
      // Misses are only worked out once logs and pauses are both here, so a paused day is never logged as missed.
      if ((await local.meta.get('downloaded:habit_logs')) && (await local.meta.get('downloaded:habit_pauses'))) habitsReady.value = true
      if (habitsReady.value && (await local.meta.get('downloaded:journal_entries'))) await journal.refreshJournal()
    }
    const synced = async () => {
      await markReady()
      syncedCount.value++
    }
    // Coming back online catches up, and counts as a finished download (a first sync may have started offline).
    const goOnline = () => {
      online.value = true
      background(engine.value?.sync().then(synced))
    }
    const goOffline = () => {
      online.value = false
      background(engine.value?.flush())
    }
    // SPEC §7: coming back to the app catches up (Realtime misses changes while a device sleeps), and leaving it
    // uploads anything queued, because a phone may stop a hidden app before it gets another chance.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') background(engine.value?.sync())
      else background(engine.value?.flush())
    }
    const onPageHide = () => background(engine.value?.flush())
    // A dropped request (weak signal) does not fire the browser's "online" event, so queued changes are retried
    // every 30 seconds while the app is open, instead of waiting for the next app start.
    const retry = setInterval(() => {
      if (status.value.pending > 0 && document.visibilityState === 'visible') background(engine.value?.sync())
    }, RETRY_MS)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    const waiting = new Map<SyncTable, ReturnType<typeof setTimeout>>()
    const unsubscribe = remote.subscribe((table) => {
      clearTimeout(waiting.get(table))
      waiting.set(table, setTimeout(() => {
        waiting.delete(table)
        background(engine.value?.pull([table]))
      }, REALTIME_WAIT_MS))
    })
    cleanup = () => {
      waiting.forEach((t) => clearTimeout(t))
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      clearInterval(retry)
      unsubscribe()
    }
    habitsReady.value = false
    badgesReady.value = false
    background(markReady())
    // Once per app start, after a sync that reached the server, old deleted rows are cleared from the device.
    const e = engine.value
    background(e.sync().then(async () => {
      if (e.getStatus().state === 'synced') await e.purgeDeleted()
      await synced()
    }))
  }

  function stop() {
    cleanup?.()
    cleanup = null
    db.value?.close()
    db.value = null
    engine.value = null
    userId.value = null
  }

  /** SPEC §8 Sign out: upload what's queued; returns how many of my changes are still not uploaded. */
  async function uploadBeforeSignOut(): Promise<number> {
    const local = db.value
    if (!local || !engine.value) return 0
    await engine.value.flush().catch(() => {})
    return local.outbox.filter((o) => o.table !== 'activity_log').count()
  }

  /** SPEC §8 Sign out: stop syncing and delete this user's stored copy from this device. */
  async function forgetDevice(): Promise<void> {
    const uid = userId.value
    stop()
    if (uid) await Dexie.delete(`my-brain-${uid}`).catch(() => {})
  }

  /**
   * SPEC §8 Delete my data: when the server's reset time is newer than this device's, throw away the stored copy
   * (and anything waiting to upload) and download again. Returns true if this device was cleared.
   */
  async function applyDataReset(serverResetAt: string | null | undefined): Promise<boolean> {
    const uid = userId.value
    const local = db.value
    if (!serverResetAt || !uid || !local || !lastRemote) return false
    const seen = (await local.meta.get('data_reset_at'))?.value
    if (seen && seen >= serverResetAt) return false
    const remote = lastRemote
    stop()
    await Dexie.delete(`my-brain-${uid}`).catch(() => {})
    start(uid, remote)
    await db.value?.meta.put({ key: 'data_reset_at', value: serverResetAt })
    return true
  }

  const ready = () => {
    if (!engine.value || !userId.value || !db.value) throw new Error('Not signed in')
    return { engine: engine.value, uid: userId.value, local: db.value }
  }
  const ctx: ActionContext = { ready, habitsReady, badgesReady }
  const habits = habitActions(ctx)
  const routines = routineActions(ctx, habits.completeHabit)
  const journal = journalActions(ctx)
  const tags = tagActions(ctx)
  const trophies = trophyActions(ctx)
  const vault = vaultActions(ctx)
  const priority = priorityActions(ctx, habits.toggleHabit)

  // ---------- Capture, tasks and quests (SPEC §5 Quick capture, Tasks, Random Quest) ----------
  /** Save a captured thought. Resolves once it is stored on this device, online or not. */
  async function capture(input: CaptureInput): Promise<CaptureRecord> {
    const { engine: e, uid } = ready()
    const record = buildCaptureRecord(input, uid)
    await e.save(record.table, record.row as never)
    await trophies.logActivity('capture', { type: input.destination })
    achieved({ kind: 'capture', table: record.table })
    return record
  }

  /** Convert an item to another type, or file an inbox item (SPEC §5). Returns the new item (null for a Post It). */
  async function convert(from: CaptureRecord, to: Omit<CaptureInput, 'text'>): Promise<CaptureRecord | null> {
    const { engine: e, uid } = ready()
    let created: CaptureRecord | null = null
    if (to.destination === 'postit') {
      // A Post It has no title, so all the words become its note (SPEC §5 Orphans).
      await addPostIt(toEditorHtml(textOf(from)), DEFAULT_POST_IT_COLOR)
      await e.remove(from.table, from.row.id)
    } else {
      const { create, retire } = buildConversion(from, to, uid)
      await e.save(create.table, create.row as never)
      await e.remove(retire.table, retire.id)
      created = create
    }
    if (from.table === 'inbox') {
      await afterOrphanGone()
      achieved({ kind: 'orphan' })
    }
    return created
  }

  /** Delete an orphan without filing it (SPEC §5 Orphans); Undo puts it back with restore. */
  async function removeOrphan(id: string) {
    await ready().engine.remove('inbox', id)
    await afterOrphanGone()
  }

  // Emptying the Orphans list counts toward a trophy (SPEC §5 Trophies).
  async function afterOrphanGone() {
    if (!live(await ready().local.inbox.toArray()).length) await trophies.logActivity('orphans_cleared')
  }

  /** Add a task typed on the Tasks screen (source "manual", default priority Low). */
  async function addTask(title: string, dueDate: string | null) {
    const { engine: e, uid } = ready()
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
    const { engine: e, local } = ready()
    const before = await local.tasks.get(row.id)
    const saved = await e.save('tasks', row)
    // Crossed off just now (not a later edit of a task already done): celebrate it (SPEC §5 Celebrations).
    if (row.status === 'done' && before?.status !== 'done') achieved({ kind: 'task', task: row })
    return saved
  }

  /** Mark a quest done (SPEC §5 Random Quest): it goes back to the list, and the completion is logged for stats. */
  async function finishQuest(quest: QuestRow, now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid } = ready()
    const done = finishedQuest(quest, now)
    const logId = crypto.randomUUID()
    await e.save('quest_logs', { id: logId, user_id: uid, quest_id: quest.id, date: todayIn(timeZone, now), completed_at: now.toISOString(), deleted_at: null })
    await e.save('quests', done)
    achieved({ kind: 'quest' })
    return logId
  }

  /** Undo marking a quest done: the quest goes back as it was and its completion is taken off the log. */
  async function unfinishQuest(before: QuestRow, logId: string) {
    const { engine: e } = ready()
    await e.remove('quest_logs', logId)
    await e.save('quests', before)
  }

  // ---------- In-app alerts (SPEC §6) ----------
  async function clearNotification(id: string) {
    await ready().engine.remove('notifications', id)
  }
  /** Clear all alerts still showing. */
  async function clearNotifications() {
    const { engine: e, local } = ready()
    await e.removeMany('notifications', live(await local.notifications.toArray()).map((n) => n.id))
  }
  /** Tapping an alert counts it as seen, on every device. */
  async function markNotificationRead(id: string) {
    await ready().engine.patch('notifications', id, (n) => (n.read_at ? {} : { read_at: new Date().toISOString() }))
  }

  // ---------- Post Its (SPEC §5 Quick capture and Dashboard) ----------
  /** A new Post It goes in front of the others. Returns null when nothing was written. */
  async function addPostIt(html: string, color: PostItColor) {
    const { engine: e, uid, local } = ready()
    const body = normalizeBody(html)
    if (!body) return null
    const row: PostItRow = { id: crypto.randomUUID(), user_id: uid, body, color, position: frontPosition(await local.post_its.toArray()), deleted_at: null }
    const saved = await e.save('post_its', row)
    achieved({ kind: 'postit' })
    return saved
  }
  async function savePostIt(row: PostItRow) {
    const body = normalizeBody(row.body)
    if (!body) return null
    return ready().engine.save('post_its', { ...row, body })
  }
  /** Save a row as it is, for screens whose rows need no rules of their own (always as the signed-in user). */
  async function save<T extends SyncTable>(table: T, row: RowTypes[T]) {
    const { engine: e, uid } = ready()
    return e.save(table, { ...row, user_id: uid })
  }
  /** Delete a row (soft, so the deletion syncs; Undo can put it back with restore). */
  async function remove(table: SyncTable, id: string) {
    await ready().engine.remove(table, id)
  }

  /** Put back something just removed (SPEC §2 Undo): deletes are soft, so it comes back with everything it had. */
  async function restore(table: SyncTable, id: string) {
    await ready().engine.patch(table, id, () => ({ deleted_at: null }))
  }

  // ---------- My people (SPEC §5 Calendar) ----------
  /** Saving an event saves everyone I typed to my people (a new name replaces the old one). */
  async function savePeople(typed: PersonToInvite[]) {
    const { engine: e, uid, local } = ready()
    const { add, rename } = peopleToSave(live(await local.people.toArray()), typed)
    for (const r of rename) await e.patch('people', r.id, () => ({ name: r.name }))
    for (const p of add) await e.save('people', { id: crypto.randomUUID(), user_id: uid, name: p.name ?? null, email: p.email ?? null, phone: p.phone ?? null, deleted_at: null })
  }

  // ---------- Events (SPEC §5 Calendar and reminders) ----------
  async function saveEvent(row: EventRow) {
    const { engine: e, uid } = ready()
    return e.save('events', { ...row, title: row.title.trim(), user_id: uid })
  }

  /** Fetch the latest from the server for some tables (after a server function changed them). */
  async function refresh(tables: SyncTable[]) {
    const { engine: e } = ready()
    await e.flush()
    await e.pull(tables)
  }

  return {
    // Signed-in state and syncing
    db,
    userId,
    status,
    online,
    habitsReady,
    badgesReady,
    syncedCount,
    start,
    stop,
    applyDataReset,
    uploadBeforeSignOut,
    forgetDevice,
    refresh,
    // Any row with no rules of its own
    save,
    remove,
    restore,
    // Capture, tasks and quests
    capture,
    convert,
    removeOrphan,
    addTask,
    saveTask,
    finishQuest,
    unfinishQuest,
    // Habits and routines
    ...habits,
    ...routines,
    newRoutine: () => routines.newRoutine(userId.value),
    // Priority reminders
    ...priority,
    // Journal
    ...journal,
    // The Vault
    ...vault,
    // Tags
    ...tags,
    // Celebrations and trophies
    ...trophies,
    // Alerts, Post Its, people and events
    clearNotification,
    clearNotifications,
    markNotificationRead,
    addPostIt,
    savePostIt,
    savePeople,
    saveEvent,
  }
})
