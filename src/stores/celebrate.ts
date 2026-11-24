// SPEC §5 Celebrations: turns finished things into a celebration that fits (confetti, a glow, a message), at the
// level I chose, including the Firsts and trophy levels the trophy keeper (src/trophies/keeper.ts) earned. Only what's
// shown lives here: nothing in this store is saved. Bursts and messages are drawn by CelebrationLayer.vue.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { onAchievement, type Achievement } from '@/celebrate/bus'
import { effectiveLevel, finishedTodaysList, isComeback, isPerfectDay, parseSetting, type CelebrationSetting } from '@/celebrate/rules'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { messages } from '@/messages'
import { TIERS, TROPHIES } from '@/trophies/definitions'
import { AWAY_DAYS, journalComeback, taskComeback } from '@/trophies/rules'
import { readKey, writeKey } from '@/ui/storage'

export type BurstSize = 'small' | 'big' | 'biggest'
export interface Burst {
  id: number
  x: number
  y: number
  size: BurstSize
}

const SETTING_KEY = 'my-brain:celebrations'
const LAST_OPEN_KEY = 'my-brain:last-open'

/** How long a message stays up before the next one (or none) shows. */
export const MESSAGE_MS = 4000
const m = messages.celebrations
const t = m.trophies
const cb = m.comebacks

export const useCelebrateStore = defineStore('celebrate', () => {
  const brain = useBrainStore()
  const setting = ref<CelebrationSetting>(parseSetting(readKey(SETTING_KEY)))
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
    writeKey(SETTING_KEY, setting.value)
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

  /** How finishing something is celebrated. Firsts and trophy levels come from the trophy keeper once it saved them. */
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
        const comeback = taskComeback(a.task, today, timeZone)
        if (comeback) say(comeback === 'carried' ? cb.carried : cb.oldUndated)
        return
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
        return
      }
      case 'step':
        if (a.finished) burst('big')
        return
      case 'capture':
      case 'postit':
        captureSaved.value++
        return
      case 'journal':
        journalSaved.value++
        if (journalComeback(await local.journal_entries.toArray(), today)) say(cb.journal)
        return
      case 'quest':
        burst('small')
        return
      case 'first':
        burst('small')
        say(m.badgeEarned(m.badges[a.badge]))
        return
      case 'trophy': {
        const trophy = TROPHIES.find((x) => x.id === a.id)
        burst('small')
        say(t.earned(t.names[a.id] ?? a.id, trophy && trophy.levels.length > 1 ? (t.tiers[TIERS[a.level - 1]!] ?? null) : null))
        return
      }
    }
  }

  let started = false
  /** Start listening (once, from App.vue). */
  function start() {
    if (started) return
    started = true
    onAchievement((a) => void handle(a).catch((err: unknown) => console.error(err)))
    // Opening the app after 7 or more days away is a comeback (SPEC §5 Trophies).
    const opened = () => {
      const last = Number(readKey(LAST_OPEN_KEY) ?? 0)
      if (last && Date.now() - last >= AWAY_DAYS * 86_400_000) say(cb.away)
      writeKey(LAST_OPEN_KEY, String(Date.now()))
    }
    opened()
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && opened())
  }

  return { setting, level, setSetting, bursts, burst, burstDone, message, say, dismiss, captureSaved, journalSaved, start }
})
