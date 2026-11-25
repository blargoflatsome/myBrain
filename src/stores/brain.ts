// The signed-in user's data (SPEC §5, §7): opens the on-device store and starts and stops syncing, then hands out
// every feature's actions (src/<feature>/actions.ts) so screens import one store and every write goes through the
// sync queue.
import { defineStore, getActivePinia } from 'pinia'
import Dexie from 'dexie'
import { ref, shallowRef } from 'vue'
import { LocalDb } from '@/sync/db'
import { SyncEngine } from '@/sync/engine'
import type { Remote, SyncStatus, SyncTable } from '@/sync/types'
import { onServerWith, type ActionContext } from '@/sync/actions'
import { background, startSyncTriggers } from '@/sync/triggers'
import { habitActions } from '@/habits/actions'
import { routineActions } from '@/routines/actions'
import { journalActions } from '@/journal/actions'
import { journalLockActions } from '@/journal/lockActions'
import { keyringFor } from '@/journal/keyring'
import { lockingRemote } from '@/journal/lockingRemote'
import { tagActions } from '@/tags/actions'
import { trophyActions } from '@/trophies/actions'
import { trophyKeeper } from '@/trophies/keeper'
import { vaultActions } from '@/vault/actions'
import { eventActions } from '@/events/actions'
import { connectionActions } from '@/connections/actions'
import { dropLostBuckets } from '@/vault/sharing'
import { priorityActions } from '@/reminders/actions'
import { taskActions } from '@/tasks/actions'
import { questActions } from '@/quests/actions'
import { peopleActions } from '@/events/peopleActions'
import { availabilityActions } from '@/events/availabilityActions'
import { captureActions } from '@/capture/actions'
import { postItActions } from '@/postits/actions'
import { alertActions } from '@/notifications/actions'
import { focusActions } from '@/focus/actions'
import { breatheActions } from '@/breathe/actions'
import { useProfileStore } from '@/stores/profile'
import { messages } from '@/messages'

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
  function start(uid: string, serverRemote: Remote) {
    if (userId.value === uid) return
    stop()
    lastRemote = serverRemote
    userId.value = uid
    db.value = new LocalDb(`my-brain-${uid}`)
    const local = db.value
    // SPEC §5 Locking my journal: journal writing is encrypted on the way up and decrypted on the way down.
    const remote = lockingRemote(serverRemote, keyringFor(local), uid)
    // A table that readiness depends on counts as soon as its own download is stored, not when the whole first sync
    // finishes, so a first badge (SPEC §5 Celebrations) isn't held up by every other table on a slow connection.
    const READY_TABLES: SyncTable[] = ['badges', 'habit_logs', 'habit_pauses', 'journal_entries']
    engine.value = new SyncEngine(local, remote, (s) => (status.value = s), () => online.value, (table) => {
      if (READY_TABLES.includes(table)) background(markReady())
    }, () => dropLostBuckets(local, uid))
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
    cleanup = startSyncTriggers({
      engine: engine.value,
      remote,
      onlineChanged: (now) => (online.value = now),
      // Coming back online counts as a finished download (a first sync may have started offline).
      caughtUp: synced,
    })
    habitsReady.value = false
    badgesReady.value = false
    background(markReady())
    // Once per app start, after a sync that reached the server, old deleted rows are cleared from the device.
    const e = engine.value
    background(e.sync().then(async () => {
      if (e.getStatus().state === 'synced') await e.purgeDeleted()
      await synced()
    }))
    keeper.start()
  }

  function stop() {
    keeper.stop()
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

  /** SPEC §7 Catching up: upload what's queued, then download everything that changed. */
  async function syncNow() {
    await ready().engine.sync()
  }

  const ready = () => {
    if (!engine.value || !userId.value || !db.value) throw new Error('Not signed in')
    return { engine: engine.value, uid: userId.value, local: db.value }
  }
  const ctx: ActionContext = { ready, signedIn: () => !!engine.value, habitsReady, badgesReady, onServer: onServerWith(ready) }
  const habits = habitActions(ctx)
  const routines = routineActions(ctx, habits.completeHabit)
  const journal = journalActions(ctx)
  const journalLock = journalLockActions(ctx)
  const tags = tagActions(ctx)
  const trophies = trophyActions(ctx)
  // Badges are saved through this store itself, so a test can hold one save to check the catch-up race.
  const pinia = getActivePinia()
  const keeper = trophyKeeper({ db, userId, online, habitsReady, badgesReady, syncedCount, trophies: { ...trophies, saveBadge: (kind, now) => useBrainStore(pinia).saveBadge(kind, now) } })
  const vault = vaultActions(ctx)
  const connections = connectionActions(ctx)
  const tasks = taskActions(ctx)
  const quests = questActions(ctx)
  const people = peopleActions(ctx)
  // Guests see my name in their invitation; with no name yet, "A friend" (SPEC §5 Shared events).
  const events = eventActions(ctx, { savePeople: people.savePeople, hostName: async () => (await useProfileStore().load())?.display_name || messages.invites.someHost })
  const availability = availabilityActions(ctx)
  const priority = priorityActions(ctx, habits.completeHabit, tasks.completeTask)
  const postIts = postItActions(ctx)
  const capture = captureActions(ctx, { addTask: tasks.addTask, addVaultItem: vault.addVaultItem, addQuest: quests.addQuest, addHabit: habits.addHabit, addPostIt: postIts.addPostIt, logActivity: trophies.logActivity })
  const alerts = alertActions(ctx)
  const focus = focusActions(ctx, trophies.logActivity)
  const breathe = breatheActions(ctx, trophies.logActivity)

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
    syncNow,
    // Capture, tasks and quests
    ...capture,
    ...tasks,
    ...quests,
    // Habits and routines
    ...habits,
    ...routines,
    newRoutine: () => routines.newRoutine(userId.value),
    // Priority reminders
    ...priority,
    // Journal
    ...journal,
    ...journalLock,
    // The Vault
    ...vault,
    // Tags
    ...tags,
    // Celebrations and trophies: the keeper saves Firsts and levels while I'm signed in
    ...trophies,
    trophyCounts: keeper.counts,
    checkTrophies: keeper.checkTrophies,
    recheckTrophies: keeper.recheckTrophies,
    catchUpTrophies: keeper.catchUp,
    trophiesIdle: keeper.idle,
    ...focus,
    ...breathe,
    // Alerts, Post Its, people and events
    ...alerts,
    ...postIts,
    ...people,
    ...availability,
    // My events, and the server calls that change them, my invitations and connections (online only)
    ...events,
    ...connections,
  }
})
