// SPEC §5 Celebrations (Firsts) and Trophies: the trophy keeper saves my Firsts and trophy levels from what I finish,
// catches up on ones my history already earned (quietly), and writes the trophies-from-the-past and perfect-day
// alerts. It runs while I'm signed in (brain.start / brain.stop), whether or not anything is on screen, and says what
// it earned on the bus so the celebration layer can celebrate it. Nothing here draws anything.
import { ref, watch, type Ref } from 'vue'
import type { LocalDb } from '@/sync/db'
import { readTables } from '@/sync/db'
import { achieved, onAchievement, type Achievement } from '@/celebrate/bus'
import { earnedFromHistory, firstFor, firstTrophiesAlertId, isPerfectDay, missingBadges, perfectDayAlertId, type BadgeKind } from '@/celebrate/rules'
import { addDays, deviceTimeZone, todayIn } from '@/time/days'
import { newLevels, trophyStates, trophyValues } from '@/trophies/rules'
import { trophyCounts, type ServerCounts } from '@/trophies/server'
import type { trophyActions } from '@/trophies/actions'
import { useAuthStore } from '@/stores/auth'
import { readKey, writeKey } from '@/ui/storage'
import { messages } from '@/messages'

/** Set once a device has worked out my trophies, so later ones are celebrated one by one (SPEC §5 Trophies). */
const trophiesReadyKey = (uid: string) => `my-brain:trophies-ready:${uid}`
/** Finishing several things in a row is checked against the trophies once. */
const CHECK_WAIT_MS = 800

export interface KeeperDeps {
  db: Readonly<Ref<LocalDb | null>>
  userId: Readonly<Ref<string | null>>
  online: Readonly<Ref<boolean>>
  habitsReady: Readonly<Ref<boolean>>
  badgesReady: Readonly<Ref<boolean>>
  syncedCount: Readonly<Ref<number>>
  trophies: ReturnType<typeof trophyActions>
}

export function trophyKeeper(d: KeeperDeps) {
  const t = messages.celebrations.trophies
  const m = messages.celebrations
  /** Connections ever made, people blocked and my Cheers tally, asked of the server when online; null until then. */
  const counts = ref<ServerCounts>({ connections: null, blocks: null, cheers: null })

  // Work started by something I did, so tests (and sign-out) can wait for it instead of guessing how long it takes.
  const working = new Set<Promise<unknown>>()
  function track(work: Promise<unknown>) {
    const p = work.catch((err: unknown) => console.error(err)).finally(() => working.delete(p))
    working.add(p)
  }

  /** Resolves once my badges have downloaded to this device (false if I sign out first). */
  function badgesDownloaded(): Promise<boolean> {
    if (d.badgesReady.value) return Promise.resolve(true)
    return new Promise((resolve) => {
      const stop = watch([d.badgesReady, d.db], ([ready, db]) => {
        if (!ready && db) return
        stop()
        resolve(!!ready)
      })
    })
  }

  /** When catch-up read the history it saved each badge quietly from, this session (Date.now()). */
  const quietlySaved = new Map<BadgeKind, number>()
  async function earnFirst(kind: BadgeKind, achievedAt: number) {
    if (!d.db.value) return
    // A First earned before my badges downloaded waits for them, so one I already have is never celebrated again.
    if (!(await badgesDownloaded())) return
    const saved = await d.trophies.saveBadge(kind)
    // Catch-up may have saved this very badge quietly while it waited, from the thing I just did: still say it.
    if (!saved && (quietlySaved.get(kind) ?? -1) < achievedAt) return
    achieved({ kind: 'first', badge: kind })
  }

  async function refreshCounts() {
    // The server only answers someone signed in to it.
    if (!d.online.value || !useAuthStore().user) return
    const fresh = await trophyCounts()
    if (fresh.connections !== null) counts.value = fresh
  }

  let checking: Promise<void> | null = null
  let checkAgain = false
  /** Work out my trophies and save any new level. The first time on a device they go in quietly, with one alert. */
  async function checkTrophies(now = new Date(), timeZone = deviceTimeZone()) {
    if (checking) {
      checkAgain = true
      return checking
    }
    checking = (async () => {
      do {
        checkAgain = false
        const local = d.db.value
        const uid = d.userId.value
        if (!local || !uid || !d.habitsReady.value || !(await badgesDownloaded())) return
        const history = await d.trophies.trophyHistory({ accountCreated: useAuthStore().user?.created_at ?? null, ...counts.value })
        const ups = newLevels(trophyStates(trophyValues(history, now, timeZone), await local.badges.toArray()))
        const firstTime = !readKey(trophiesReadyKey(uid))
        let raised = 0
        for (const s of ups) if (await d.trophies.saveTrophyLevel(s.trophy.id, s.level, now)) raised++
        writeKey(trophiesReadyKey(uid), '1')
        if (!raised) continue
        if (firstTime) {
          const id = firstTrophiesAlertId(uid)
          const today = todayIn(timeZone, now)
          await d.trophies.addAlert({ id, kind: 'trophies', item_id: id, title: t.fromPast.title(raised), body: t.fromPast.body, url: '/#trophies', local_date: today, sent_at: now.toISOString() })
          continue
        }
        for (const s of ups) achieved({ kind: 'trophy', id: s.trophy.id, level: s.level })
      } while (checkAgain)
    })().finally(() => (checking = null))
    return checking
  }

  let checkTimer: ReturnType<typeof setTimeout> | undefined
  /** Check trophies shortly after something is finished (a burst of changes is checked once). */
  function soonCheckTrophies() {
    clearTimeout(checkTimer)
    checkTimer = setTimeout(() => {
      checkTimer = undefined
      track(checkTrophies())
    }, CHECK_WAIT_MS)
  }

  /** Ask the server for its counts again, then check trophies (after cheering someone on, SPEC §5 Cheers). */
  function recheckTrophies() {
    track(refreshCounts().then(() => checkTrophies()))
  }

  /**
   * Firsts my history already earned go in quietly, and yesterday's perfect day brings its congratulations the first
   * time I open the app today. Only once this device holds my history (habitsReady), so nothing is guessed.
   */
  async function catchUp(now = new Date(), timeZone = deviceTimeZone()) {
    const local = d.db.value
    const uid = d.userId.value
    if (!local || !d.habitsReady.value || !uid) return
    const history = await readTables(local, {
      tasks: 'tasks',
      habitLogs: 'habit_logs',
      routineRuns: 'routine_runs',
      journalEntries: 'journal_entries',
      vaultItems: 'vault_items',
      questLogs: 'quest_logs',
      postIts: 'post_its',
      inbox: 'inbox',
      // A task done and later deleted, a Vault item or Post It saved and later removed still happened, so they count;
      // an undone quest was never finished (SPEC §5 Celebrations: Firsts).
    }, { includeDeleted: ['tasks', 'vaultItems', 'postIts'] })
    const readAt = Date.now()
    const missing = new Set(missingBadges(await local.badges.toArray()))
    for (const kind of earnedFromHistory(history)) {
      if (!missing.has(kind)) continue
      // Noted before saving: a First whose own save finds this badge already there must know catch-up just saved it
      // from history read after the thing I did, even while catch-up's save is still finishing.
      quietlySaved.set(kind, readAt)
      if (!(await d.trophies.saveBadge(kind, now))) quietlySaved.delete(kind)
    }
    // Trophies are worked out alongside, without holding up the rest (asking the server can be slow).
    track(refreshCounts().then(() => checkTrophies(now, timeZone)))

    const today = todayIn(timeZone, now)
    const yesterday = addDays(today, -1)
    if (!isPerfectDay(await local.habits.toArray(), history.habitLogs, yesterday, now, timeZone)) return
    const id = perfectDayAlertId(uid, yesterday)
    await d.trophies.addAlert({ id, kind: 'perfect_day', item_id: id, title: m.perfectDayAlert.title, body: m.perfectDayAlert.body, url: '/habits', local_date: today, sent_at: now.toISOString() })
  }

  function onFinished(a: Achievement) {
    if (!d.db.value || a.kind === 'first' || a.kind === 'trophy') return
    soonCheckTrophies()
    const kind = firstFor(a)
    if (kind) track(earnFirst(kind, Date.now()))
  }

  let stopAll: (() => void) | null = null
  /** Start keeping my trophies (brain.start, once a user's store is open). */
  function start() {
    stop()
    const unsubscribe = onAchievement(onFinished)
    let lastDay = ''
    const check = () => {
      const day = todayIn(deviceTimeZone())
      if (!d.habitsReady.value || day === lastDay) return
      lastDay = day
      track(catchUp())
    }
    // Again once this session's download finishes: habits ticked on another device may only be here now.
    const unwatch = watch([d.habitsReady, d.userId, d.syncedCount], () => ((lastDay = ''), check()), { immediate: true })
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    const daily = setInterval(check, 60_000)
    stopAll = () => {
      unsubscribe()
      unwatch()
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(daily)
      clearTimeout(checkTimer)
      checkTimer = undefined
    }
  }
  function stop() {
    stopAll?.()
    stopAll = null
    quietlySaved.clear()
  }

  /** Resolves once everything started by what I did is saved, checking trophies now rather than after the short wait. */
  async function idle() {
    while (working.size || checkTimer) {
      if (checkTimer) {
        clearTimeout(checkTimer)
        checkTimer = undefined
        track(checkTrophies())
      }
      await Promise.all([...working])
    }
  }

  return { counts, start, stop, idle, checkTrophies, recheckTrophies, catchUp }
}
