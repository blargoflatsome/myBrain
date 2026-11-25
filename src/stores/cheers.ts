// SPEC §5 Cheers: whether I'm stuck today, the I did it! box's draft, and the quiet "Share it in Cheers?" offer at
// natural moments (an alert under the bell, kept for a day). Nothing is ever posted for me.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { onAchievement, type Achievement } from '@/celebrate/bus'
import { amStuck } from '@/cheers/cheers'
import { CHEERS_OFFER_ALERT, CHEERS_UNSTUCK_ALERT, OFFER_GAP_MS, offerFor, type Moment } from '@/cheers/rules'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { daysBetween, deviceTimeZone, localMoment, todayIn } from '@/time/days'
import { taskComeback } from '@/trophies/rules'
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

  let lastUnstuckOffer = 0
  function handle(a: Achievement, now = new Date()) {
    if (!brain.online || !brain.userId) return
    const moment = momentOf(a, now, deviceTimeZone())
    if (!moment) return
    const last = Number(readKey(LAST_OFFER_KEY) ?? 0)
    const offer = offerFor(moment, stuckToday(), last, now.getTime())
    if (!offer) return
    const id = crypto.randomUUID()
    const alert = { id, item_id: null, local_date: todayIn(deviceTimeZone(), now), sent_at: now.toISOString() }
    if (offer.kind === 'unstuck') {
      // One finished thing often brings a trophy a moment later: offer once, not twice in a row.
      if (now.getTime() - lastUnstuckOffer < OFFER_GAP_MS / 12) return
      lastUnstuckOffer = now.getTime()
      // Cheers shows I got unstuck! while I'm stuck, so the alert just goes there.
      void brain.addAlert({ ...alert, kind: CHEERS_UNSTUCK_ALERT, title: m.offer.unstuck, body: '', url: '/cheers' }).catch((err: unknown) => console.error(err))
      return
    }
    // Opening it puts the suggested line in the I did it! box (CheersView reads it from the alert). The 2-hour gap
    // starts now (a trophy right after is not offered too); if saving fails, the gap goes back to the last offer.
    writeKey(LAST_OFFER_KEY, String(now.getTime()))
    void brain
      .addAlert({ ...alert, kind: CHEERS_OFFER_ALERT, title: m.offer.didIt, body: offer.line, url: `/cheers?offer=${id}` })
      .catch((err: unknown) => {
        console.error(err)
        writeKey(LAST_OFFER_KEY, last ? String(last) : null)
      })
  }

  let started = false
  /** Start listening (once, from App.vue). */
  function start() {
    if (started) return
    started = true
    onAchievement((a) => handle(a))
    watch([() => brain.userId, () => brain.online], () => void loadStuck(), { immediate: true })
  }

  return { stuckDay, draft, stuckToday, loadStuck, setStuck, start, handle }
})
