// Availability (SPEC §5 Availability schedule): turn free/busy rows into busy times, find conflicts, suggest times.
// Only times are ever handled here, never titles or details.
import { zonedTime } from '@/habits/rules'
import { occursOn } from '@/events/rules'
import { addDays, daysBetween, todayIn } from '@/tasks/days'
import type { EventRepeat } from '@/sync/types'

/** One row from the free_busy server function. */
export interface FreeBusyRow {
  user_id: string
  timezone: string
  kind: 'rule' | 'exception' | 'event'
  weekday: number | null
  start_date: string | null
  start_time: string | null
  end_date: string | null
  end_time: string | null
  repeat: EventRepeat | null
  busy: boolean
}

export interface Interval {
  start: number
  end: number
}

const hhmm = (t: string) => t.slice(0, 5)
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/** Remove the parts of `busy` covered by `free`. */
function subtract(busy: Interval[], free: Interval[]): Interval[] {
  let out = busy
  for (const f of free) {
    out = out.flatMap((b) => {
      if (!overlaps(b, f)) return [b]
      const parts: Interval[] = []
      if (b.start < f.start) parts.push({ start: b.start, end: f.start })
      if (f.end < b.end) parts.push({ start: f.end, end: b.end })
      return parts
    })
  }
  return out
}

/**
 * Each person's busy times between two dates (inclusive): weekly unavailable times, unavailable exceptions (minus
 * "available" exceptions), and their timed events. All-day events don't block time; a day away is set as an
 * unavailable exception.
 */
export function busyTimes(rows: FreeBusyRow[], from: string, to: string): Map<string, Interval[]> {
  const byUser = new Map<string, Interval[]>()
  const freeByUser = new Map<string, Interval[]>()
  const add = (map: Map<string, Interval[]>, user: string, i: Interval) => {
    if (!map.has(user)) map.set(user, [])
    map.get(user)!.push(i)
  }
  for (const r of rows) {
    const tz = r.timezone || 'UTC'
    if (r.kind === 'rule' && r.weekday !== null && r.start_time && r.end_time) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (new Date(`${d}T12:00:00Z`).getUTCDay() !== r.weekday) continue
        add(byUser, r.user_id, { start: zonedTime(d, hhmm(r.start_time), tz), end: zonedTime(d, hhmm(r.end_time), tz) })
      }
    } else if (r.kind === 'exception' && r.start_date) {
      if (r.start_date < from || r.start_date > to) continue
      const i = r.start_time && r.end_time
        ? { start: zonedTime(r.start_date, hhmm(r.start_time), tz), end: zonedTime(r.start_date, hhmm(r.end_time), tz) }
        : { start: zonedTime(r.start_date, '00:00', tz), end: zonedTime(addDays(r.start_date, 1), '00:00', tz) }
      add(r.busy ? byUser : freeByUser, r.user_id, i)
    } else if (r.kind === 'event' && r.start_date && r.end_date && r.start_time && r.end_time) {
      const length = daysBetween(r.start_date, r.end_date)
      for (let d = addDays(from, -length); d <= to; d = addDays(d, 1)) {
        if (!occursOn({ start_date: r.start_date, repeat: r.repeat ?? 'never' }, d)) continue
        add(byUser, r.user_id, { start: zonedTime(d, hhmm(r.start_time), tz), end: zonedTime(addDays(d, length), hhmm(r.end_time), tz) })
      }
    }
  }
  for (const [user, busy] of byUser) byUser.set(user, subtract(busy, freeByUser.get(user) ?? []))
  return byUser
}

/** Whether someone is busy during a time. */
export function hasConflict(busy: Interval[] | undefined, slot: Interval): boolean {
  return (busy ?? []).some((b) => overlaps(b, slot))
}

/**
 * Up to `count` times when everyone is free: the same length as the event, in the next `days` days, starting on the
 * half hour between 8 am and 9 pm in my timezone, never in the past.
 */
export function suggestTimes(
  busy: Map<string, Interval[]>,
  lengthMs: number,
  now: Date,
  timeZone: string,
  { days = 14, count = 3, dayStart = '08:00', dayEnd = '21:00' } = {},
): Interval[] {
  const all = [...busy.values()].flat()
  const out: Interval[] = []
  const today = todayIn(timeZone, now)
  for (let d = today, i = 0; i < days && out.length < count; d = addDays(d, 1), i++) {
    const open = zonedTime(d, dayStart, timeZone)
    const close = zonedTime(d, dayEnd, timeZone)
    for (let start = open; start + lengthMs <= close && out.length < count; start += 30 * 60_000) {
      if (start < now.getTime()) continue
      const slot = { start, end: start + lengthMs }
      if (!all.some((b) => overlaps(b, slot))) {
        out.push(slot)
        start = slot.end - 30 * 60_000 // next suggestion starts after this one
      }
    }
  }
  return out
}
