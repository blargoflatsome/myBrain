// SPEC §5 Celebrations: turns finished things into a celebration that fits (confetti, a glow, a message, a badge),
// at the level I chose. Bursts and messages are drawn by CelebrationLayer.vue.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { onAchievement, type Achievement } from '@/celebrate/bus'
import {
  effectiveLevel,
  earnedFromHistory,
  finishedTodaysList,
  isComeback,
  isPerfectDay,
  missingBadges,
  parseSetting,
  perfectDayAlertId,
  type BadgeKind,
  type CelebrationSetting,
} from '@/celebrate/rules'
import { addDays, deviceTimeZone, todayIn } from '@/tasks/days'
import { messages } from '@/messages'

export type BurstSize = 'small' | 'big' | 'biggest'
export interface Burst {
  id: number
  x: number
  y: number
  size: BurstSize
}

const SETTING_KEY = 'my-brain:celebrations'
/** How long a message stays up before the next one (or none) shows. */
export const MESSAGE_MS = 4000
const m = messages.celebrations

function readSetting(): CelebrationSetting {
  try {
    return parseSetting(localStorage.getItem(SETTING_KEY))
  } catch {
    return 'full'
  }
}

export const useCelebrateStore = defineStore('celebrate', () => {
  const brain = useBrainStore()
  const setting = ref<CelebrationSetting>(readSetting())
  const motionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
  const reduceMotion = ref(!!motionQuery?.matches)
  motionQuery?.addEventListener?.('change', (e) => (reduceMotion.value = e.matches))
  /** How lively celebrations are on this device right now. */
  const level = computed(() => effectiveLevel(setting.value, reduceMotion.value))
  // Screens style their own small moments (a check drawing in, a glow) from this attribute.
  watch(level, (l) => (document.documentElement.dataset.celebrate = l), { immediate: true })

  /** Keep my choice on this device (the Account page saves it to my profile too). */
  function setSetting(value: unknown) {
    setting.value = parseSetting(value)
    try {
      localStorage.setItem(SETTING_KEY, setting.value)
    } catch {
      // Storage blocked: it follows my profile the next time the app starts.
    }
  }

  // Confetti comes out of what I just tapped or clicked; with the keyboard, out of the focused control.
  let lastPoint: { x: number; y: number } | null = null
  let lastPointAt = 0
  window.addEventListener('pointerdown', (e) => ((lastPoint = { x: e.clientX, y: e.clientY }), (lastPointAt = Date.now())), { capture: true, passive: true })
  function origin(): { x: number; y: number } {
    const active = document.activeElement
    if (lastPoint && Date.now() - lastPointAt < 3000) return lastPoint
    if (active instanceof HTMLElement && active !== document.body) {
      const r = active.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }

  const bursts = ref<Burst[]>([])
  let nextId = 1
  /** Confetti (Full only). Big ones fill the screen from its middle. */
  function burst(size: BurstSize) {
    if (level.value !== 'full') return
    const at = size === 'small' ? origin() : { x: window.innerWidth / 2, y: window.innerHeight / 3 }
    bursts.value = [...bursts.value, { id: nextId++, ...at, size }]
  }
  function burstDone(id: number) {
    bursts.value = bursts.value.filter((b) => b.id !== id)
  }

  /** Short messages, one at a time; each is also heard by screen readers. */
  const message = ref<{ id: number; text: string } | null>(null)
  const queue: string[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  function say(text: string) {
    if (message.value?.text === text || queue.includes(text)) return
    queue.push(text)
    if (!message.value) showNext()
  }
  function showNext() {
    const text = queue.shift()
    message.value = text ? { id: nextId++, text } : null
    clearTimeout(timer)
    if (text) timer = setTimeout(showNext, MESSAGE_MS)
  }
  function dismiss() {
    showNext()
  }

  /** Counters screens watch for their own moment: the Capture button's pulse and the journal's glow. */
  const captureSaved = ref(0)
  const journalSaved = ref(0)

  /** Resolves once my badges have downloaded to this device (false if I sign out first). */
  function badgesDownloaded(): Promise<boolean> {
    if (brain.badgesReady) return Promise.resolve(true)
    return new Promise((resolve) => {
      const stop = watch([() => brain.badgesReady, () => brain.db], ([ready, db]) => {
        if (!ready && db) return
        stop()
        resolve(!!ready)
      })
    })
  }

  async function earn(kind: BadgeKind) {
    if (!brain.db) return
    // A badge earned before my badges downloaded waits for them, so one I already have is never celebrated again.
    if (!(await badgesDownloaded())) return
    if (!(await brain.saveBadge(kind))) return
    burst('small')
    say(m.badgeEarned(m.badges[kind]))
  }

  async function handle(a: Achievement) {
    const local = brain.db
    if (!local) return
    const timeZone = deviceTimeZone()
    const now = new Date()
    const today = todayIn(timeZone, now)
    switch (a.kind) {
      case 'task': {
        const tasks = await local.tasks.toArray()
        burst(finishedTodaysList(tasks, a.task, today, timeZone) ? 'big' : 'small')
        return earn('first_task')
      }
      case 'habit': {
        const logs = await local.habit_logs.toArray()
        if (isPerfectDay(await local.habits.toArray(), logs, today, now, timeZone)) {
          burst('biggest')
          say(m.allHabits)
        } else {
          burst('small')
          if (isComeback(a.habit, logs, today, now, timeZone)) say(m.welcomeBack)
        }
        return earn('first_habit')
      }
      case 'step':
        if (!a.finished) return
        burst('big')
        return earn('first_routine')
      case 'capture':
        captureSaved.value++
        if (a.table === 'vault_items') return earn('first_vault')
        return
      case 'postit':
        captureSaved.value++
        return earn('first_postit')
      case 'journal':
        journalSaved.value++
        return earn('first_journal')
      case 'quest':
        burst('small')
        return earn('first_quest')
      case 'vault':
        return earn('first_vault')
      case 'orphan':
        return earn('first_orphan')
      case 'shared_event':
        return earn('first_shared_event')
      case 'focus':
        return earn('first_focus')
    }
  }

  /**
   * Badges my history already earned go in quietly, and yesterday's perfect day brings its congratulations the
   * first time I open the app today. Only once this device holds my history (habitsReady), so nothing is guessed.
   */
  async function catchUp(now = new Date(), timeZone = deviceTimeZone()) {
    const local = brain.db
    if (!local || !brain.habitsReady || !brain.userId) return
    const history = {
      tasks: await local.tasks.toArray(),
      habitLogs: await local.habit_logs.toArray(),
      routineRuns: await local.routine_runs.toArray(),
      journalEntries: await local.journal_entries.toArray(),
      vaultItems: await local.vault_items.toArray(),
      questLogs: await local.quest_logs.toArray(),
      postIts: await local.post_its.toArray(),
      inbox: await local.inbox.toArray(),
    }
    const missing = new Set(missingBadges(await local.badges.toArray()))
    for (const kind of earnedFromHistory(history)) if (missing.has(kind)) await brain.saveBadge(kind, now)

    const today = todayIn(timeZone, now)
    const yesterday = addDays(today, -1)
    if (!isPerfectDay(await local.habits.toArray(), history.habitLogs, yesterday, now, timeZone)) return
    const id = perfectDayAlertId(brain.userId, yesterday)
    await brain.addAlert({ id, kind: 'perfect_day', item_id: id, title: m.perfectDayAlert.title, body: m.perfectDayAlert.body, url: '/habits', local_date: today, sent_at: now.toISOString() })
  }

  let started = false
  /** Start listening (once, from App.vue). */
  function start() {
    if (started) return
    started = true
    onAchievement((a) => void handle(a).catch((err: unknown) => console.error(err)))
    let lastDay = ''
    const check = () => {
      const day = todayIn(deviceTimeZone())
      if (!brain.habitsReady || day === lastDay) return
      lastDay = day
      void catchUp().catch((err: unknown) => console.error(err))
    }
    // Again once this session's download finishes: habits ticked on another device may only be here now.
    watch([() => brain.habitsReady, () => brain.userId, () => brain.syncedCount], () => ((lastDay = ''), check()), { immediate: true })
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    setInterval(check, 60_000)
  }

  return { setting, level, setSetting, bursts, burst, burstDone, message, say, dismiss, captureSaved, journalSaved, earn, catchUp, start }
})
