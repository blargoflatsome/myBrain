// Availability (SPEC §5 Availability schedule): turn free/busy rows into busy times, find conflicts, suggest times.
// Only times are ever handled here, never titles or details.
import { zonedTime } from '@/habits/rules'
import { occursOn } from '@/events/rules'
import { addDays, daysBetween, todayIn } from '@/tasks/days'
import type { AvailabilityExceptionRow, AvailabilityRuleRow, EventRepeat } from '@/sync/types'

/** One row from the free_busy server function. */
export interface FreeBusyRow {
  user_id: string
  timezone: string
  /** 'shares' says I can see this person's times at all; anyone with no rows is unknown. */
  kind: 'shares' | 'rule' | 'exception' | 'event'
  weekday: number | null
  start_date: string | null
  start_time: string | null
  end_date: string | null
  end_time: string | null
  repeat: EventRepeat | null
  busy: boolean
  /** 'tentative' for an event they said Maybe to. */
  level?: 'busy' | 'tentative' | null
}

export interface Interval {
  start: number
  end: number
}

/** One person's busy and tentative (Maybe) times. */
export interface PersonTimes {
  busy: Interval[]
  tentative: Interval[]
}
export type Status = 'free' | 'busy' | 'tentative' | 'unknown'

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
 * Each person's busy and tentative times between two dates (inclusive): weekly unavailable times, unavailable
 * one-off days (minus "available after all" ones), and the events the server counts as busy (timed, or shown as
 * Busy; an event without times blocks the whole day). Only people whose times I can see are in the result, so
 * anyone missing is unknown.
 */
export function personTimes(rows: FreeBusyRow[], from: string, to: string): Map<string, PersonTimes> {
  const out = new Map<string, PersonTimes>()
  const free = new Map<string, Interval[]>()
  const of = (user: string) => {
    if (!out.has(user)) out.set(user, { busy: [], tentative: [] })
    return out.get(user)!
  }
  const day = (d: string, tz: string): Interval => ({ start: zonedTime(d, '00:00', tz), end: zonedTime(addDays(d, 1), '00:00', tz) })
  for (const r of rows) {
    const tz = r.timezone || 'UTC'
    const mine = of(r.user_id)
    if (r.kind === 'rule' && r.weekday !== null && r.start_time && r.end_time) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (new Date(`${d}T12:00:00Z`).getUTCDay() !== r.weekday) continue
        mine.busy.push({ start: zonedTime(d, hhmm(r.start_time), tz), end: zonedTime(d, hhmm(r.end_time), tz) })
      }
    } else if (r.kind === 'exception' && r.start_date) {
      if (r.start_date < from || r.start_date > to) continue
      const i = r.start_time && r.end_time
        ? { start: zonedTime(r.start_date, hhmm(r.start_time), tz), end: zonedTime(r.start_date, hhmm(r.end_time), tz) }
        : day(r.start_date, tz)
      if (r.busy) mine.busy.push(i)
      else free.set(r.user_id, [...(free.get(r.user_id) ?? []), i])
    } else if (r.kind === 'event' && r.start_date && r.end_date) {
      const length = daysBetween(r.start_date, r.end_date)
      const list = r.level === 'tentative' ? mine.tentative : mine.busy
      for (let d = addDays(from, -length); d <= to; d = addDays(d, 1)) {
        if (!occursOn({ start_date: r.start_date, repeat: r.repeat ?? 'never' }, d)) continue
        if (r.start_time && r.end_time) {
          list.push({ start: zonedTime(d, hhmm(r.start_time), tz), end: zonedTime(addDays(d, length), hhmm(r.end_time), tz) })
        } else {
          list.push({ start: day(d, tz).start, end: day(addDays(d, length), tz).end })
        }
      }
    }
  }
  for (const [user, t] of out) out.set(user, { busy: subtract(t.busy, free.get(user) ?? []), tentative: t.tentative })
  return out
}

/** Someone's status for a time: unknown when I can't see their times. */
export function statusAt(times: PersonTimes | undefined, slot: Interval): Status {
  if (!times) return 'unknown'
  if (times.busy.some((b) => overlaps(b, slot))) return 'busy'
  if (times.tentative.some((b) => overlaps(b, slot))) return 'tentative'
  return 'free'
}

export type Rating = 'good' | 'fair' | 'poor'
export interface Suggestion extends Interval {
  rating: Rating
  /** Who can't make it (busy, or tentative), by id. */
  cantMake: string[]
}
const RANK: Record<Rating, number> = { good: 0, fair: 1, poor: 2 }

/**
 * Up to `count` times for an event (SPEC §10 Scheduler): the same length, on the half hour between 8 am and 9 pm in
 * my time zone, from `fromDay` (or today, if that's earlier) over the next `days` days, never in the past. Good: every
 * required person free and nobody tentative. Fair: every required person free, but someone tentative or an optional
 * person busy. Poor: a required person busy (fewest first). Unknown people don't count against a time. Suggestions
 * never overlap each other.
 */
export function findTimes(
  people: { id: string; optional: boolean }[],
  times: Map<string, PersonTimes>,
  lengthMs: number,
  fromDay: string,
  now: Date,
  timeZone: string,
  { days = 14, count = 5, dayStart = '08:00', dayEnd = '21:00' } = {},
): Suggestion[] {
  const today = todayIn(timeZone, now)
  const first = fromDay < today ? today : fromDay
  const candidates: (Suggestion & { requiredBusy: number })[] = []
  for (let d = first, i = 0; i < days; d = addDays(d, 1), i++) {
    const open = zonedTime(d, dayStart, timeZone)
    const close = zonedTime(d, dayEnd, timeZone)
    for (let start = open; start + lengthMs <= close; start += 30 * 60_000) {
      if (start < now.getTime()) continue
      const slot = { start, end: start + lengthMs }
      let requiredBusy = 0
      let fairOnly = false
      const cantMake: string[] = []
      for (const p of people) {
        const s = statusAt(times.get(p.id), slot)
        if (s === 'busy' && !p.optional) requiredBusy++
        if (s === 'busy' || s === 'tentative') {
          cantMake.push(p.id)
          fairOnly = true
        }
      }
      const rating: Rating = requiredBusy ? 'poor' : fairOnly ? 'fair' : 'good'
      candidates.push({ ...slot, rating, cantMake, requiredBusy })
    }
  }
  candidates.sort((a, b) => RANK[a.rating] - RANK[b.rating] || a.requiredBusy - b.requiredBusy || a.start - b.start)
  const out: Suggestion[] = []
  for (const c of candidates) {
    if (out.length >= count) break
    if (out.some((o) => overlaps(o, c))) continue
    out.push({ start: c.start, end: c.end, rating: c.rating, cantMake: c.cantMake })
  }
  return out
}

/** A block of my own time I'm not available, in my local time ("2026-11-10T09:00"), for the Calendar's shading. */
export interface LocalBlock {
  start: string
  end: string
}
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * SPEC §10 Scheduler, on my Calendar: the times I'm not available each day between two dates (inclusive), from my
 * weekly times and unavailable one-off days, minus "available after all" ones. Local times, never shared.
 */
export function myUnavailable(
  rules: Pick<AvailabilityRuleRow, 'weekday' | 'start_time' | 'end_time' | 'deleted_at'>[],
  exceptions: Pick<AvailabilityExceptionRow, 'date' | 'start_time' | 'end_time' | 'kind' | 'deleted_at'>[],
  from: string,
  to: string,
): LocalBlock[] {
  const out: LocalBlock[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const weekday = new Date(`${d}T12:00:00Z`).getUTCDay()
    const span = (x: { start_time: string | null; end_time: string | null }) =>
      x.start_time && x.end_time ? { start: toMin(x.start_time), end: toMin(x.end_time) } : { start: 0, end: 24 * 60 }
    const busy = [
      ...rules.filter((r) => !r.deleted_at && r.weekday === weekday).map(span),
      ...exceptions.filter((x) => !x.deleted_at && x.date === d && x.kind === 'unavailable').map(span),
    ]
    const free = exceptions.filter((x) => !x.deleted_at && x.date === d && x.kind === 'available').map(span)
    const blocks = subtract(busy, free).sort((a, b) => a.start - b.start)
    // Overlapping or touching blocks are drawn as one.
    const merged: Interval[] = []
    for (const b of blocks) {
      const last = merged.at(-1)
      if (last && b.start <= last.end) last.end = Math.max(last.end, b.end)
      else merged.push({ ...b })
    }
    for (const b of merged) {
      out.push({ start: `${d}T${toTime(b.start)}`, end: b.end >= 24 * 60 ? `${addDays(d, 1)}T00:00` : `${d}T${toTime(b.end)}` })
    }
  }
  return out
}
