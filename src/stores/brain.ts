// The signed-in user's data: on-device store, sync engine, and the actions screens use (SPEC §5, §7).
import { defineStore } from 'pinia'
import Dexie from 'dexie'
import { ref, shallowRef } from 'vue'
import { LocalDb } from '@/sync/db'
import { SyncEngine } from '@/sync/engine'
import type { HabitLogRow, HabitRow, QuestRow, Remote, RoutineRow, RoutineStepRow, SyncStatus, TaskRow } from '@/sync/types'
import { activeSteps, currentRun, habitDoneStepIds, recordStep, stepsForDay } from '@/routines/rules'
import { cancelState, snoozeState, type DuePriority } from '@/reminders/priority'
import type { PriorityTaskRow } from '@/sync/types'
import { logIdFor, missedDaysToRecord, newHabit, streaks, toggleAction, wrongMisses } from '@/habits/rules'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { DEFAULT_PRIORITY } from '@/tasks/rules'
import { dayStats, emptyEntry, hadActivity, missingDays, statsUpdate, type DayData } from '@/journal/stats'
import type { AvailabilityExceptionRow, AvailabilityRuleRow, EventRow, JournalEntryRow, SyncTable, TaggedType, VaultBucketRow, VaultItemRow } from '@/sync/types'
import { tagChanges } from '@/tags/rules'
import { normalizeBody } from '@/journal/body'
import { boardOrder, frontPosition, noteToTask } from '@/postits/rules'
import type { PostItColor, PostItRow } from '@/sync/types'
import { buildBucket, buildCaptureRecord, buildConversion, type CaptureInput, type CaptureRecord } from '@/capture/capture'

/** Run sync work in the background. A store closed by sign-out mid-sync is expected and ignored. */
function background(work: Promise<unknown> | undefined) {
  work?.catch((err: unknown) => {
    if ((err as { name?: string })?.name === 'DatabaseClosedError') return
    console.error(err)
  })
}

/** How often queued changes are retried while the app is open (SPEC §7). */
export const RETRY_MS = 30_000

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

    const goOnline = () => {
      online.value = true
      background(engine.value?.sync())
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
    const unsubscribe = remote.subscribe((table) => background(engine.value?.pull([table])))
    cleanup = () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      clearInterval(retry)
      unsubscribe()
    }
    habitsReady.value = false
    const local = db.value
    const markReady = async () => {
      if (await local.meta.get('downloaded:habit_logs')) habitsReady.value = true
      if (habitsReady.value && (await local.meta.get('downloaded:journal_entries'))) await refreshJournal()
    }
    background(markReady())
    background(engine.value.sync().then(markReady))
    window.addEventListener('online', () => background(engine.value?.sync().then(markReady)), { once: true })
  }

  function stop() {
    cleanup?.()
    cleanup = null
    db.value?.close()
    db.value = null
    engine.value = null
    userId.value = null
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

  async function saveQuest(row: QuestRow) {
    return requireReady().engine.save('quests', row)
  }

  async function deleteQuest(id: string) {
    await requireReady().engine.remove('quests', id)
  }

  async function addHabit(title: string) {
    const { engine: e, uid } = requireReady()
    if (!title.trim()) return null
    return e.save('habits', newHabit(title, uid, deviceTimeZone()))
  }

  async function saveHabit(row: HabitRow) {
    return requireReady().engine.save('habits', row)
  }

  /** Delete a habit; any routine step linked to it is removed too (SPEC §5 Routines). */
  async function deleteHabit(id: string) {
    const { engine: e, local } = requireReady()
    await e.remove('habits', id)
    for (const step of (await local.routine_steps.toArray()).filter((s) => s.habit_id === id && !s.deleted_at)) {
      await e.remove('routine_steps', step.id)
    }
  }

  async function logsFor(habitId: string): Promise<HabitLogRow[]> {
    const { local } = requireReady()
    return local.habit_logs.where('habit_id').equals(habitId).toArray()
  }

  /**
   * SPEC §5 Habits: write a "missed" log for each scheduled day whose deadline passed, then refresh the cached
   * streak numbers from the logs. Safe to run often; it only writes when something changed.
   */
  async function refreshHabit(habit: HabitRow, now = new Date(), timeZone = deviceTimeZone()) {
    if (!habitsReady.value) return
    const { engine: e, uid } = requireReady()
    let logs = await logsFor(habit.id)
    // Remove "missed" logs whose day is still open (written too early, e.g. on the day the habit was created).
    for (const wrong of wrongMisses(habit, logs, now, timeZone)) {
      await e.remove('habit_logs', wrong.id)
      logs = logs.map((l) => (l.id === wrong.id ? { ...l, deleted_at: now.toISOString() } : l))
    }
    for (const date of missedDaysToRecord(habit, logs, now, timeZone)) {
      const log: HabitLogRow = { id: logIdFor(habit.id, date), user_id: uid, habit_id: habit.id, date, status: 'missed', deleted_at: null }
      await e.save('habit_logs', log)
      logs = [...logs, log]
    }
    const { current, best } = streaks(habit, logs, now, timeZone)
    // Update only the cached numbers on the latest copy, in one step, so an edit saved meanwhile is kept.
    await e.patch('habits', habit.id, (fresh) =>
      current !== fresh.current_streak || best !== fresh.best_streak ? { current_streak: current, best_streak: best } : null,
    )
  }

  /** Complete today's habit, or undo a completion before its deadline. */
  async function toggleHabit(habit: HabitRow, now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid } = requireReady()
    const date = todayIn(timeZone, now)
    const logs = await logsFor(habit.id)
    const action = toggleAction(habit, date, logs, now, timeZone)
    if (action.kind === 'complete') {
      await e.save('habit_logs', {
        id: logIdFor(habit.id, date),
        user_id: uid,
        habit_id: habit.id,
        date,
        status: 'completed',
        completed_at: now.toISOString(),
        deleted_at: null,
      })
    } else if (action.kind === 'undo') {
      await e.remove('habit_logs', action.log.id)
    }
    await refreshHabit(habit, now, timeZone)
    return action.kind
  }

  /** A new routine starts today, runs every day, with no steps yet. */
  function newRoutine(): RoutineRow {
    return {
      id: crypto.randomUUID(),
      user_id: userId.value ?? undefined,
      title: '',
      notify_time: null,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      start_date: todayIn(deviceTimeZone()),
      deleted_at: null,
    }
  }

  /**
   * Save a routine and its ordered steps. Steps keep their ids so history stays attached; steps no longer in the
   * list are soft-deleted (their history is kept, SPEC §5 Routines).
   */
  async function saveRoutine(routine: RoutineRow, steps: { id?: string; title: string; habitId?: string | null }[]) {
    const { engine: e, uid, local } = requireReady()
    await e.save('routines', { ...routine, user_id: uid })
    const existing = activeSteps(await local.routine_steps.where('routine_id').equals(routine.id).toArray(), routine.id)
    const keep = new Set<string>()
    const today = todayIn(deviceTimeZone())
    for (const [position, s] of steps.entries()) {
      if (!s.title.trim()) continue
      const before = s.id ? existing.find((x) => x.id === s.id) : undefined
      const habitId = s.habitId ?? null
      const row: RoutineStepRow = before
        ? { ...before, title: s.title.trim(), position, habit_id: habitId }
        : { id: crypto.randomUUID(), user_id: uid, routine_id: routine.id, position, title: s.title.trim(), habit_id: habitId, start_date: today, deleted_at: null }
      keep.add(row.id)
      if (!before || before.title !== row.title || before.position !== row.position || (before.habit_id ?? null) !== habitId) {
        await e.save('routine_steps', row)
      }
    }
    for (const old of existing) if (!keep.has(old.id)) await e.remove('routine_steps', old.id)
  }

  async function deleteRoutine(id: string) {
    await requireReady().engine.remove('routines', id)
  }

  /** Press Skip or Completed on the routine's current step for today (SPEC §5 Routines). */
  async function recordRoutineStep(routine: RoutineRow, status: 'completed' | 'skipped', now = new Date()) {
    const { engine: e, uid, local } = requireReady()
    const date = todayIn(deviceTimeZone(), now)
    const habits = await local.habits.toArray()
    const steps = stepsForDay(activeSteps(await local.routine_steps.where('routine_id').equals(routine.id).toArray(), routine.id), habits, date)
    const runs = await local.routine_runs.where('routine_id').equals(routine.id).toArray()
    const run = currentRun(routine, runs, date)
    const logs = run ? await local.routine_step_logs.where('run_id').equals(run.id).toArray() : []
    const habitDone = habitDoneStepIds(steps, await local.habit_logs.toArray(), date)
    const action = recordStep(routine, steps, run, logs, status, date, uid, now, habitDone)
    if (!action) return null
    if (action.run) await e.save('routine_runs', action.run)
    for (const log of action.logs) await e.save('routine_step_logs', log)
    if (action.finish) await e.save('routine_runs', action.finish)
    // A completed habit step completes the habit for the day too (SPEC §5 Routines: one tick counts for both).
    if (action.completeHabitId) {
      const habit = habits.find((h) => h.id === action.completeHabitId && !h.deleted_at)
      if (habit) await completeHabit(habit, now)
    }
    return action
  }

  /** Complete a habit for today if it is still open (never undoes a completion). */
  async function completeHabit(habit: HabitRow, now = new Date(), timeZone = deviceTimeZone()) {
    const date = todayIn(timeZone, now)
    if (toggleAction(habit, date, await logsFor(habit.id), now, timeZone).kind === 'complete') await toggleHabit(habit, now, timeZone)
  }

  // ---------- Journal (SPEC §5 Journal) ----------
  async function dayData(): Promise<DayData> {
    const { local } = requireReady()
    return {
      tasks: await local.tasks.toArray(),
      habits: await local.habits.toArray(),
      habitLogs: await local.habit_logs.toArray(),
      routines: await local.routines.toArray(),
      routineSteps: await local.routine_steps.toArray(),
      routineRuns: await local.routine_runs.toArray(),
      routineStepLogs: await local.routine_step_logs.toArray(),
      priorityTasks: await local.priority_tasks.toArray(),
      priorityTaskLogs: await local.priority_task_logs.toArray(),
      quests: await local.quests.toArray(),
    }
  }

  /** The stats for a day, worked out from the on-device history (shown live for today). */
  async function journalStats(date: string, now = new Date(), timeZone = deviceTimeZone()) {
    return dayStats(await dayData(), date, now, timeZone)
  }

  /**
   * Write an entry on my behalf for each day that ended without one (if I did something that day), keep today's stats current, and freeze the
   * stats of days that have ended. Only runs once this device has the server's habits and journal, so a fresh
   * device never writes over entries it has not downloaded yet. Safe to run often.
   */
  async function refreshJournal(now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid, local } = requireReady()
    if (!habitsReady.value || !(await local.meta.get('downloaded:journal_entries'))) return
    const today = todayIn(timeZone, now)
    const data = await dayData()
    const entries = await local.journal_entries.toArray()
    // When this device started journaling, so no entries are invented for days before it.
    let start = (await local.meta.get('journal_start'))?.value
    if (!start) {
      start = today
      await local.meta.put({ key: 'journal_start', value: start })
    }
    for (const date of missingDays(entries, today, start)) {
      const stats = dayStats(data, date, now, timeZone)
      if (!hadActivity(stats)) continue // a day with nothing done gets no entry
      await e.save('journal_entries', { ...emptyEntry(uid, date, true), stats, stats_final: true })
    }
    for (const entry of entries) {
      if (entry.deleted_at || entry.stats_final) continue
      const stats = dayStats(data, entry.date, now, timeZone)
      await e.patch('journal_entries', entry.id, (fresh) => statsUpdate(fresh, stats, today))
    }
  }

  /** Save what I wrote for a day. Writing in an entry the app made makes it mine. Always editable (SPEC §5 Journal). */
  async function saveJournalBody(date: string, html: string, now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid, local } = requireReady()
    const body = normalizeBody(html)
    const today = todayIn(timeZone, now)
    const existing = (await local.journal_entries.where('date').equals(date).toArray()).find((x) => !x.deleted_at)
    const auto = (row: JournalEntryRow) => row.auto && !body
    if (existing) {
      await e.patch('journal_entries', existing.id, (fresh) => (fresh.body === body ? null : { body, auto: auto(fresh) }))
      return
    }
    const stats = dayStats(await dayData(), date, now, timeZone)
    await e.save('journal_entries', { ...emptyEntry(uid, date, false), body, stats, stats_final: date < today })
  }

  /**
   * Save the journal's other answers for a day: "How to make tomorrow better?" and "Was today better than
   * yesterday?" (SPEC §5 Journal). Creates the day's entry if needed; always editable.
   */
  async function saveJournalFields(
    date: string,
    fields: { tomorrow?: string; better_than_yesterday?: boolean | null },
    now = new Date(),
    timeZone = deviceTimeZone(),
  ) {
    const { engine: e, uid, local } = requireReady()
    const today = todayIn(timeZone, now)
    const existing = (await local.journal_entries.where('date').equals(date).toArray()).find((x) => !x.deleted_at)
    if (fields.tomorrow !== undefined) fields = { ...fields, tomorrow: normalizeBody(fields.tomorrow) }
    if (existing) {
      await e.patch('journal_entries', existing.id, () => ({ ...fields, auto: false }))
      return
    }
    const stats = dayStats(await dayData(), date, now, timeZone)
    await e.save('journal_entries', { ...emptyEntry(uid, date, false), ...fields, stats, stats_final: date < today })
  }

  // ---------- Post Its (SPEC §5 Quick capture and Dashboard) ----------
  /** A new Post It goes in front of the others. Returns null when nothing was written. */
  async function addPostIt(html: string, color: PostItColor) {
    const { engine: e, uid, local } = requireReady()
    const body = normalizeBody(html)
    if (!body) return null
    const row: PostItRow = { id: crypto.randomUUID(), user_id: uid, body, color, position: frontPosition(await local.post_its.toArray()), deleted_at: null }
    return e.save('post_its', row)
  }
  async function savePostIt(row: PostItRow) {
    const body = normalizeBody(row.body)
    if (!body) return null
    return requireReady().engine.save('post_its', { ...row, body })
  }
  /** Done: off the Dashboard straight away (Undo puts it back). */
  async function removePostIt(id: string) {
    await requireReady().engine.remove('post_its', id)
  }
  async function restorePostIt(id: string) {
    await requireReady().engine.patch('post_its', id, () => ({ deleted_at: null }))
  }
  /** Make a task: first line the title, the rest notes, in Undated; the Post It is removed. */
  async function postItToTask(id: string) {
    const { engine: e, uid, local } = requireReady()
    const note = await local.post_its.get(id)
    const parts = note ? noteToTask(note.body) : null
    if (!note || !parts) return null
    const task: TaskRow = { id: crypto.randomUUID(), user_id: uid, title: parts.title, notes: parts.notes, due_date: null, priority: DEFAULT_PRIORITY, status: 'open', source: 'capture', deleted_at: null }
    await e.save('tasks', task)
    await e.remove('post_its', id)
    return task
  }
  /** Move a note from one place on the board to another and save the new order. */
  async function reorderPostIts(from: number, to: number) {
    const { engine: e, local } = requireReady()
    const order = boardOrder(await local.post_its.toArray())
    if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved!)
    for (const [position, note] of order.entries()) {
      if (note.position !== position) await e.patch('post_its', note.id, () => ({ position }))
    }
  }

  // ---------- The Vault (SPEC §5 The Vault) ----------
  async function saveBucket(row: VaultBucketRow) {
    const { engine: e, uid } = requireReady()
    return e.save('vault_buckets', { ...row, user_id: uid })
  }

  /** Delete a bucket and the items in it (the caller has already confirmed). */
  async function deleteBucket(id: string) {
    const { engine: e, local } = requireReady()
    for (const item of (await local.vault_items.where('bucket_id').equals(id).toArray()).filter((i) => !i.deleted_at)) {
      await e.remove('vault_items', item.id)
    }
    await e.remove('vault_buckets', id)
  }

  async function addVaultItem(bucketId: string, title: string) {
    const { engine: e, uid } = requireReady()
    const trimmed = title.trim()
    if (!trimmed) return null
    // created_at is set here too, so items keep the order they were added in before they reach the server.
    return e.save('vault_items', { id: crypto.randomUUID(), user_id: uid, bucket_id: bucketId, title: trimmed, notes: null, rating: null, link: null, checked: false, created_at: new Date().toISOString(), deleted_at: null })
  }

  async function saveVaultItem(row: VaultItemRow) {
    const { engine: e, uid } = requireReady()
    return e.save('vault_items', { ...row, user_id: uid })
  }

  async function deleteVaultItem(id: string) {
    await requireReady().engine.remove('vault_items', id)
  }

  async function toggleVaultItem(id: string) {
    await requireReady().engine.patch('vault_items', id, (fresh) => ({ checked: !fresh.checked }))
  }

  /** "Clear checked": delete the checked items in a checklist bucket (the caller has already confirmed). */
  async function clearChecked(bucketId: string) {
    const { engine: e, local } = requireReady()
    for (const item of (await local.vault_items.where('bucket_id').equals(bucketId).toArray()).filter((i) => !i.deleted_at && i.checked)) {
      await e.remove('vault_items', item.id)
    }
  }

  // ---------- Events (SPEC §5 Calendar and reminders) ----------
  async function saveEvent(row: EventRow) {
    const { engine: e, uid } = requireReady()
    return e.save('events', { ...row, title: row.title.trim(), user_id: uid })
  }

  async function deleteEvent(id: string) {
    await requireReady().engine.remove('events', id)
  }

  // ---------- Availability (SPEC §5 Availability schedule) ----------
  async function saveAvailabilityRule(row: AvailabilityRuleRow) {
    const { engine: e, uid } = requireReady()
    return e.save('availability_rules', { ...row, user_id: uid })
  }
  async function deleteAvailabilityRule(id: string) {
    await requireReady().engine.remove('availability_rules', id)
  }
  async function saveAvailabilityException(row: AvailabilityExceptionRow) {
    const { engine: e, uid } = requireReady()
    return e.save('availability_exceptions', { ...row, user_id: uid })
  }
  async function deleteAvailabilityException(id: string) {
    await requireReady().engine.remove('availability_exceptions', id)
  }

  /** Fetch the latest from the server for some tables (after a server function changed them). */
  async function refresh(tables: SyncTable[]) {
    const { engine: e } = requireReady()
    await e.flush()
    await e.pull(tables)
  }

  // ---------- Tags (SPEC §5 Global search and tags) ----------
  /** Set an item's tags by name: new tags are created, dropped ones are taken off the item (the tag itself stays). */
  async function saveTags(type: TaggedType, itemId: string, names: string[]) {
    const { engine: e, uid, local } = requireReady()
    const changes = tagChanges(uid, type, itemId, names, await local.tags.toArray(), await local.item_tags.where('item_id').equals(itemId).toArray())
    for (const tag of changes.newTags) await e.save('tags', tag)
    for (const link of changes.add) await e.save('item_tags', link)
    for (const link of changes.remove) await e.remove('item_tags', link.id)
  }

  // ---------- Priority reminders (SPEC §5) ----------
  async function savePriorityTask(row: PriorityTaskRow) {
    const { engine: e, uid } = requireReady()
    return e.save('priority_tasks', { ...row, user_id: uid })
  }

  async function deletePriorityTask(id: string) {
    await requireReady().engine.remove('priority_tasks', id)
  }

  /** Slide to complete: a priority habit is completed for the day; a priority task gets today's completion. */
  async function completePriority(item: DuePriority, now = new Date()) {
    const { engine: e, uid, local } = requireReady()
    if (item.kind === 'habit') {
      const habit = await local.habits.get(item.id)
      if (habit) await toggleHabit(habit, now)
      return
    }
    await e.save('priority_task_logs', {
      id: `${item.id.slice(0, 24)}${item.date.replaceAll('-', '')}0000`,
      user_id: uid,
      task_id: item.id,
      date: item.date,
      completed_at: now.toISOString(),
      deleted_at: null,
    })
  }

  async function snoozePriority(item: DuePriority, now = new Date()) {
    const { engine: e, uid, local } = requireReady()
    const existing = (await local.reminder_state.where('item_id').equals(item.id).toArray()).find((s) => s.date === item.date && !s.deleted_at)
    await e.save('reminder_state', snoozeState(item, existing, uid, now))
  }

  async function cancelPriority(item: DuePriority, now = new Date()) {
    const { engine: e, uid, local } = requireReady()
    const existing = (await local.reminder_state.where('item_id').equals(item.id).toArray()).find((s) => s.date === item.date && !s.deleted_at)
    await e.save('reminder_state', cancelState(item, existing, uid, now))
  }

  return {
    db,
    saveJournalFields,
    applyDataReset,
    saveAvailabilityRule,
    deleteAvailabilityRule,
    saveAvailabilityException,
    deleteAvailabilityException,
    refresh,
    saveBucket,
    deleteBucket,
    addVaultItem,
    addPostIt,
    savePostIt,
    removePostIt,
    restorePostIt,
    postItToTask,
    reorderPostIts,
    saveVaultItem,
    deleteVaultItem,
    toggleVaultItem,
    clearChecked,
    saveEvent,
    deleteEvent,
    saveTags,
    journalStats,
    refreshJournal,
    saveJournalBody,
    savePriorityTask,
    deletePriorityTask,
    completePriority,
    snoozePriority,
    cancelPriority,
    newRoutine,
    saveRoutine,
    deleteRoutine,
    recordRoutineStep,
    habitsReady,
    addHabit,
    saveHabit,
    deleteHabit,
    refreshHabit,
    toggleHabit,
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
    saveQuest,
    deleteQuest,
  }
})
