// SPEC §9 TV app, The dashboard: the Monthly calendar's weeks and Your Day, worked out from what tv_snapshot returns.
// Pure rules, built on the main app's (§5 Calendar and reminders, §5 Tasks), so the TV shows the same things.
import type { EventInviteRow, EventRow, TaskRow } from '@/sync/types'
import { calendarItems, myPlace, occursOn } from '@/events/rules'
import { tasksForDay } from '@/tasks/rules'
import { addDays, daysBetween, weekdayOf } from '@/time/days'

/** Rows in Your Day's box per page. */
export const DAY_PAGE_SIZE = 7
/** Items a calendar day shows before "+2 more". */
export const CELL_ITEMS = 3

export interface CalendarData {
  tasks: TaskRow[]
  events: EventRow[]
  invites: EventInviteRow[]
  me: string | null
}

/** The first day of the month a date is in. */
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`

/** The first day of the month `n` months from the one `month` is in. */
export function addMonths(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`
}

/** The weeks shown for a month: Sunday on or before the 1st to Saturday on or after its last day. */
export function monthWeeks(month: string): string[][] {
  const first = monthOf(month)
  const last = addDays(addMonths(first, 1), -1)
  const from = addDays(first, -weekdayOf(first))
  const to = addDays(last, 6 - weekdayOf(last))
  const weeks: string[][] = []
  for (let d = from; d <= to; d = addDays(d, 7)) weeks.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(d, i)))
  return weeks
}

/** The first and last day the calendar shows for a month (what tv_snapshot is asked for). */
export function monthRange(month: string): { from: string; to: string } {
  const weeks = monthWeeks(month)
  return { from: weeks[0]![0]!, to: weeks[weeks.length - 1]![6]! }
}

export interface CellItem {
  id: string
  kind: 'task' | 'event'
  title: string
  /** 'HH:MM' for a timed event. */
  time: string | null
  done: boolean
  cancelled: boolean
  /** An invitation I haven't answered (drawn dashed). */
  pending: boolean
}

/**
 * Each shown day's items, like the main calendar's month view (SPEC §5 Calendar): events first (all-day, then by start
 * time; an event lasting several days shows on each), then tasks in their calendar order.
 */
export function monthItems(data: CalendarData, from: string, to: string): Record<string, CellItem[]> {
  const byDay: Record<string, CellItem[]> = {}
  const add = (day: string, item: CellItem) => {
    if (day < from || day > to) return
    ;(byDay[day] = byDay[day] || []).push(item)
  }
  for (const item of calendarItems(data, from, to)) {
    const classes = item.className.split(' ')
    const start = item.start.slice(0, 10)
    const cell: CellItem = {
      id: item.id,
      kind: item.extendedProps.kind,
      title: item.title,
      time: item.allDay ? null : item.start.slice(11, 16),
      done: classes.indexOf('cal-done') >= 0,
      cancelled: classes.indexOf('cal-cancelled') >= 0,
      pending: classes.indexOf('cal-pending') >= 0,
    }
    // All-day ends are exclusive (the day after); timed ones end on their last day.
    const end = item.end ? (item.allDay ? addDays(item.end.slice(0, 10), -1) : item.end.slice(0, 10)) : start
    for (let i = 0, n = Math.max(0, daysBetween(start, end)); i <= n; i++) add(addDays(start, i), cell)
  }
  const rank = (c: CellItem) => (c.kind === 'task' ? 2 : c.time ? 1 : 0)
  for (const day of Object.keys(byDay)) {
    byDay[day] = byDay[day]!.map((c, i) => ({ c, i }))
      .sort((a, b) => rank(a.c) - rank(b.c) || (a.c.time || '').localeCompare(b.c.time || '') || a.i - b.i)
      .map(({ c }) => c)
  }
  return byDay
}

export type DayRow =
  | { kind: 'event'; id: string; title: string; start: string | null; end: string | null }
  | { kind: 'task'; id: string; title: string; priority: number; done: boolean; carriedOver: boolean }

/**
 * Your Day (SPEC §9): today's events (mine and ones I said Yes to; not cancelled), all-day ones first then by time,
 * then today's tasks in the Tasks page order, carried-over ones included and done ones crossed off at the end.
 */
export function yourDay(data: CalendarData, today: string, timeZone: string): DayRow[] {
  const going = (e: EventRow) => {
    const place = myPlace(e, data.invites, data.me)
    return place === 'mine' || place === 'yes'
  }
  const events = data.events
    .filter((e) => !e.deleted_at && !e.cancelled_at && going(e) && covers(e, today))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    .map((e): DayRow => ({ kind: 'event', id: e.id, title: e.title, start: hhmm(e.start_time), end: hhmm(e.end_time) }))
  const tasks = tasksForDay(data.tasks, today, today, timeZone).map(
    (t): DayRow => ({ kind: 'task', id: t.id, title: t.title, priority: t.priority ?? 1, done: t.status === 'done', carriedOver: t.status === 'open' && t.due_date! < today }),
  )
  return events.concat(tasks)
}

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null)

/** Whether an event (or one of its repeats) is on a day, counting the days a long one lasts. */
function covers(e: EventRow, day: string): boolean {
  const length = daysBetween(e.start_date, e.end_date)
  for (let i = 0; i <= length; i++) if (occursOn(e, addDays(day, -i))) return true
  return false
}

/** One page of a list, with how many pages there are (at least one). */
export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(Math.max(0, page), pages - 1)
  return { rows: rows.slice(p * size, p * size + size), page: p, pages }
}
