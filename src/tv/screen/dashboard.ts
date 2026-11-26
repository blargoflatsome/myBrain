// SPEC §9 TV app, The dashboard: the Monthly calendar's weeks and Your Day, worked out from what tv_snapshot returns.
// Pure rules, built on the main app's (§5 Calendar and reminders, §5 Tasks, §5 Habits), so the TV shows the same things.
import type { EventInviteRow, EventRow, HabitLogRow, HabitPauseRow, HabitRow, TaskRow } from '@/sync/types'
import { calendarItems, myPlace, occursOn } from '@/events/rules'
import { tasksForDay } from '@/tasks/rules'
import { dayStatus } from '@/habits/rules'
import { addDays, clockIn, daysBetween, weekdayOf } from '@/time/days'

/** Rows in Your Day's box per page (the top half of the right column, SPEC §9 Layout). */
export const DAY_PAGE_SIZE = 4
/** Routines the bottom strip shows at once (SPEC §9 Routines). */
export const ROUTINE_PAGE_SIZE = 3
/** Items a calendar day shows before "+2 more". */
export const CELL_ITEMS = 2

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

export interface DayRow {
  kind: 'event' | 'task' | 'habit'
  id: string
  title: string
}

export interface DayData extends CalendarData {
  habits: HabitRow[]
  habitLogs: HabitLogRow[]
  habitPauses: HabitPauseRow[]
}

/**
 * Your Day (SPEC §9): what's left of today, titles only. Today's events (mine and ones I said Yes to; not cancelled)
 * that haven't ended, all-day ones first then by time; then today's open tasks in the Tasks page order, carried-over
 * ones included; then the habits due today and not done (the Habits page's own day status). `allDone` is true when
 * something was planned for today and nothing is left.
 */
export function yourDay(data: DayData, today: string, now: Date, timeZone: string): { rows: DayRow[]; allDone: boolean } {
  const going = (e: EventRow) => {
    const place = myPlace(e, data.invites, data.me)
    return place === 'mine' || place === 'yes'
  }
  const clock = clockIn(now.getTime(), timeZone)
  const events = data.events
    .filter((e) => !e.deleted_at && !e.cancelled_at && going(e))
    .map((e) => ({ e, from: startedOn(e, today) }))
    .filter((x): x is { e: EventRow; from: string } => x.from !== null)
    .map(({ e, from }) => {
      // A timed event ends at its end time on its last day (its start time when it has none); all day, at midnight.
      const lastDay = addDays(from, daysBetween(e.start_date, e.end_date))
      const start = from === today ? hhmm(e.start_time) : null
      const end = lastDay === today ? hhmm(e.end_time) || start : null
      return { row: { kind: 'event', id: e.id, title: e.title } as DayRow, start, ended: !!end && end <= clock }
    })
  const tasks = tasksForDay(data.tasks, today, today, timeZone)
  const habits = data.habits
    .filter((h) => !h.deleted_at)
    .map((h) => ({ h, status: dayStatus(h, today, data.habitLogs, now, timeZone, data.habitPauses) }))
    // Open or done today; a paused habit, or one past its timer, isn't part of today's plan.
    .filter((x) => x.status === 'open' || x.status === 'completed')
    .sort((a, b) => (a.h.created_at || '').localeCompare(b.h.created_at || ''))
  const rows = events
    .filter((x) => !x.ended)
    .sort((a, b) => minutes(a.start) - minutes(b.start))
    .map((x) => x.row)
    .concat(tasks.filter((t) => t.status === 'open').map((t): DayRow => ({ kind: 'task', id: t.id, title: t.title })))
    .concat(habits.filter((x) => x.status === 'open').map(({ h }): DayRow => ({ kind: 'habit', id: h.id, title: h.title })))
  const planned = events.length + tasks.length + habits.length
  return { rows, allDone: planned > 0 && rows.length === 0 }
}

const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null)

/** The day the occurrence of an event that covers `day` began (a long one may have begun earlier), or null. */
function startedOn(e: EventRow, day: string): string | null {
  const length = daysBetween(e.start_date, e.end_date)
  for (let i = 0; i <= length; i++) if (occursOn(e, addDays(day, -i))) return addDays(day, -i)
  return null
}

/** All-day first (and events going on since an earlier day), then by start time. */
const minutes = (start: string | null) => (start ? Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) : -1)

/** One page of a list, with how many pages there are (at least one). */
export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(Math.max(0, page), pages - 1)
  return { rows: rows.slice(p * size, p * size + size), page: p, pages }
}
