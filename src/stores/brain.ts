// The signed-in user's data: on-device store, sync engine, and the actions screens use (SPEC §5, §7).
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { LocalDb } from '@/sync/db'
import { SyncEngine } from '@/sync/engine'
import type { HabitLogRow, HabitRow, QuestRow, Remote, RoutineRow, RoutineStepRow, SyncStatus, TaskRow } from '@/sync/types'
import { activeSteps, recordStep, runFor } from '@/routines/rules'
import { cancelState, snoozeState, type DuePriority } from '@/reminders/priority'
import type { PriorityTaskRow } from '@/sync/types'
import { logIdFor, missedDaysToRecord, newHabit, streaks, toggleAction, wrongMisses } from '@/habits/rules'
import { deviceTimeZone, todayIn } from '@/tasks/days'
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
  /**
   * True once this device holds the server's habit history (after a first full download, now or in an earlier
   * session). Misses are only recorded after that, so a fresh device never mistakes "not downloaded yet" for "missed".
   */
  const habitsReady = ref(false)
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
    habitsReady.value = false
    const local = db.value
    const markReady = async () => {
      if (await local.meta.get('downloaded:habit_logs')) habitsReady.value = true
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

  async function deleteHabit(id: string) {
    await requireReady().engine.remove('habits', id)
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
  async function saveRoutine(routine: RoutineRow, steps: { id?: string; title: string }[]) {
    const { engine: e, uid, local } = requireReady()
    await e.save('routines', { ...routine, user_id: uid })
    const existing = activeSteps(await local.routine_steps.where('routine_id').equals(routine.id).toArray(), routine.id)
    const keep = new Set<string>()
    const today = todayIn(deviceTimeZone())
    for (const [position, s] of steps.entries()) {
      if (!s.title.trim()) continue
      const before = s.id ? existing.find((x) => x.id === s.id) : undefined
      const row: RoutineStepRow = before
        ? { ...before, title: s.title.trim(), position }
        : { id: crypto.randomUUID(), user_id: uid, routine_id: routine.id, position, title: s.title.trim(), start_date: today, deleted_at: null }
      keep.add(row.id)
      if (!before || before.title !== row.title || before.position !== row.position) await e.save('routine_steps', row)
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
    const steps = activeSteps(await local.routine_steps.where('routine_id').equals(routine.id).toArray(), routine.id)
    const runs = await local.routine_runs.where('routine_id').equals(routine.id).toArray()
    const run = runFor(runs, routine.id, date)
    const logs = run ? await local.routine_step_logs.where('run_id').equals(run.id).toArray() : []
    const action = recordStep(routine, steps, run, logs, status, date, uid, now)
    if (!action) return null
    if (action.run) await e.save('routine_runs', action.run)
    await e.save('routine_step_logs', action.log)
    if (action.finish) await e.save('routine_runs', action.finish)
    return action
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
