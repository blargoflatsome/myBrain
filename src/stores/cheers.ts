// SPEC §5 Cheers: whether I'm stuck today, the I did it! box's draft, and the quiet "Share it in Cheers?" offer at
// natural moments (in the bottom bar, like Undo). Nothing is ever posted for me.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { onAchievement, type Achievement } from '@/celebrate/bus'
import { amStuck, postCheer } from '@/cheers/cheers'
import { OFFER_GAP_MS, offerFor, type Moment } from '@/cheers/rules'
import { messages } from '@/messages'
import { router } from '@/router'
import { useBrainStore } from '@/stores/brain'
import { useCelebrateStore } from '@/stores/celebrate'
import { useUndoStore } from '@/stores/undo'
import { daysBetween, deviceTimeZone, todayIn } from '@/tasks/days'
import { localMoment, taskComeback } from '@/trophies/rules'
import { readKey, writeKey } from '@/ui/storage'

const LAST_OFFER_KEY = 'my-brain:cheers-last-offer'
const m = messages.cheers

/** A finished thing as Cheers sees it, or null if it isn't one (a step that didn't finish the routine). */
export function momentOf(a: Achievement, now: Date, timeZone: string): Moment | null {
  const today = todayIn(timeZone, now)
  switch (a.kind) {
    case 'task': {
      const comeback = taskComeback(a.task, today, timeZone)
      if (comeback === 'carried') return { kind: 'old_task', days: daysBetween(a.task.due_date!, today) }
      if (comeback === 'old_undated') return { kind: 'old_task', days: daysBetween(localMoment(a.task.created_at!, timeZone).date, today) }
      return { kind: 'small' }
    }
    case 'habit':
      return { kind: 'small' }
    case 'step':
      return a.finished ? { kind: 'routine' } : null
    case 'quest':
      return { kind: 'quest', ugh: a.energy === 'ugh' }
    case 'trophy':
      return { kind: 'trophy', name: messages.celebrations.trophies.names[a.id] ?? a.id }
    default:
      return null
  }
}

export const useCheersStore = defineStore('cheers', () => {
  const brain = useBrainStore()
  const undo = useUndoStore()
  /** The day I posted I'm stuck and haven't posted I got unstuck! since, or null. */
  const stuckDay = ref<string | null>(null)
  /** Text waiting in the I did it! box (from an offer), or null when it's closed. */
  const draft = ref<string | null>(null)

  const today = () => todayIn(deviceTimeZone())
  const stuckToday = () => stuckDay.value === today()

  /** Ask the server (it knows across devices). */
  async function loadStuck() {
    if (!brain.online || !brain.userId) return
    try {
      stuckDay.value = (await amStuck()) ? today() : null
    } catch {
      // Offline or the server didn't answer: keep what this device knows.
    }
  }
  function setStuck(stuck: boolean) {
    stuckDay.value = stuck ? today() : null
  }

  async function postUnstuck() {
    try {
      await postCheer('unstuck')
      setStuck(false)
      useCelebrateStore().say(m.posted)
    } catch {
      useCelebrateStore().say(m.postFailed)
    }
  }

  let lastUnstuckOffer = 0
  function handle(a: Achievement, now = new Date()) {
    if (!brain.online || !brain.userId) return
    const moment = momentOf(a, now, deviceTimeZone())
    if (!moment) return
    const last = Number(readKey(LAST_OFFER_KEY) ?? 0)
    const offer = offerFor(moment, stuckToday(), last, now.getTime())
    if (!offer) return
    if (offer.kind === 'unstuck') {
      // One finished thing often brings a trophy a moment later: offer once, not twice in a row.
      if (now.getTime() - lastUnstuckOffer < OFFER_GAP_MS / 12) return
      lastUnstuckOffer = now.getTime()
      undo.offer(m.offer.unstuck, postUnstuck, m.offer.share)
      return
    }
    writeKey(LAST_OFFER_KEY, String(now.getTime()))
    const line = offer.line
    undo.offer(m.offer.didIt, () => {
      draft.value = line
      return router.push('/cheers')
    }, m.offer.share)
  }

  let started = false
  /** Start listening (once, from App.vue). */
  function start() {
    if (started) return
    started = true
    onAchievement((a) => handle(a))
    watch([() => brain.userId, () => brain.online], () => void loadStuck(), { immediate: true })
  }

  return { stuckDay, draft, stuckToday, loadStuck, setStuck, postUnstuck, start, handle }
})
