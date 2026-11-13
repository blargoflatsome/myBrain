// SPEC §10 Scheduler: who's free for an event's time (connections on it, and me), and Find a time. Only free, busy,
// maybe busy or unknown is ever handled here, never what anyone's plans are.
import { computed, ref, watch, type Ref } from 'vue'
import { findTimes, personTimes, statusAt, type Interval, type PersonTimes, type Status, type Suggestion } from '@/events/availability'
import { freeBusy } from '@/events/sharing'
import { zonedTime } from '@/habits/rules'
import { addDays, deviceTimeZone, todayIn } from '@/tasks/days'
import { useBrainStore } from '@/stores/brain'

/** A connection on the event: already invited, or about to be. */
export interface SchedulingPerson {
  id: string
  name: string
  optional: boolean
}

/** How far ahead times are read and searched (SPEC: the following 14 days). */
const DAYS = 14

export function useScheduling(
  people: Ref<SchedulingPerson[]>,
  when: Ref<{ startDate: string; startTime: string | null; endDate: string; endTime: string | null }>,
) {
  const brain = useBrainStore()
  const tz = deviceTimeZone()
  const times = ref<Map<string, PersonTimes>>(new Map())
  const loading = ref(false)
  const checked = ref(false)

  /** The days to read: the event's day (or today, if that's earlier) and the 14 days after, so Find a time and the
   *  chosen time both have everyone's times, however far ahead the event is. */
  const window = computed(() => {
    const today = todayIn(tz)
    const first = when.value.startDate && when.value.startDate < today ? when.value.startDate : today
    const pick = when.value.startDate > today ? when.value.startDate : today
    const last = [addDays(pick, DAYS), when.value.endDate || pick].sort().at(-1)!
    return { from: first, to: last }
  })
  const ids = computed(() => people.value.map((p) => p.id).sort().join(','))

  watch(
    [ids, () => window.value.from, () => window.value.to, () => brain.online],
    async () => {
      if (!people.value.length || !brain.online || !brain.userId) {
        times.value = new Map()
        checked.value = false
        return
      }
      loading.value = true
      const { from, to } = window.value
      const rows = await freeBusy([...people.value.map((p) => p.id), brain.userId]).catch(() => [])
      times.value = personTimes(rows, from, to)
      loading.value = false
      checked.value = true
    },
    { immediate: true },
  )

  /** The event's time, or null for an all-day event (all-day events don't take up a time). */
  const slot = computed<Interval | null>(() => {
    const w = when.value
    if (!w.startDate || !w.startTime || !w.endTime) return null
    return { start: zonedTime(w.startDate, w.startTime.slice(0, 5), tz), end: zonedTime(w.endDate || w.startDate, w.endTime.slice(0, 5), tz) }
  })

  const statuses = computed(() => {
    const out = new Map<string, Status>()
    if (!slot.value || !checked.value) return out
    for (const p of people.value) out.set(p.id, statusAt(times.value.get(p.id), slot.value))
    return out
  })
  const myStatus = computed<Status | null>(() => (slot.value && checked.value && brain.userId ? statusAt(times.value.get(brain.userId), slot.value) : null))
  const freeCount = computed(() => [...statuses.value.values()].filter((s) => s === 'free').length)
  const unknownNames = computed(() => people.value.filter((p) => !times.value.has(p.id)).map((p) => p.name))

  /** Find a time: up to 5 ranked times, me included as a required person. */
  function suggest(): Suggestion[] {
    if (!slot.value || !brain.userId) return []
    const everyone = [...people.value.map((p) => ({ id: p.id, optional: p.optional })), { id: brain.userId, optional: false }]
    return findTimes(everyone, times.value, slot.value.end - slot.value.start, when.value.startDate, new Date(), tz, { days: DAYS })
  }

  return { statuses, myStatus, freeCount, unknownNames, loading, checked, slot, suggest, tz }
}
