// Event rules (SPEC §5 Calendar and reminders): repeats, occurrences in a date range, and what the calendar shows.
import type { EventInviteRow, EventRepeat, EventRow, PriorityTaskRow, TaskRow } from '@/sync/types'
import { weekdayOf } from '@/habits/rules'
import { isTaskScheduled } from '@/reminders/priority'
import { addDays, daysBetween } from '@/tasks/days'

export const REPEATS: EventRepeat[] = ['never', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly']
/** Reminder choices, in minutes before the start (null = none). All-day events count from 9:00 am. */
export const REMINDERS: (number | null)[] = [null, 0, 5, 10, 15, 30, 60, 1440]

const day = (date: string) => Number(date.slice(8, 10))
const month = (date: string) => Number(date.slice(5, 7))

/** Whether an event happens on a date. Monthly events skip months without that day (same rule as the server). */
export function occursOn(event: Pick<EventRow, 'start_date' | 'repeat'>, date: string): boolean {
  if (date < event.start_date) return false
  switch (event.repeat) {
    case 'never':
      return date === event.start_date
    case 'daily':
      return true
    case 'weekdays': {
      const w = weekdayOf(date)
      return w >= 1 && w <= 5
    }
    case 'weekly':
      return weekdayOf(date) === weekdayOf(event.start_date)
    case 'monthly':
      return day(date) === day(event.start_date)
    case 'yearly':
      return day(date) === day(event.start_date) && month(date) === month(event.start_date)
  }
}

/** The dates an event starts on between two dates (inclusive). A multi-day event that began earlier is included. */
export function occurrences(event: EventRow, from: string, to: string): string[] {
  const length = daysBetween(event.start_date, event.end_date)
  const dates: string[] = []
  for (let d = addDays(from, -length); d <= to; d = addDays(d, 1)) if (occursOn(event, d)) dates.push(d)
  return dates
}

export interface CalendarItem {
  id: string
  title: string
  start: string
  end?: string
  allDay: boolean
  /** CSS classes, space separated (FullCalendar 7's className). */
  className: string
  extendedProps: { kind: 'task' | 'priority_task' | 'event'; itemId: string; date: string }
}

const hhmm = (time: string) => time.slice(0, 5)

/** Everything the calendar shows between two dates: dated tasks, priority tasks, and my events (SPEC §5 Calendar). */
export function calendarItems(
  data: { tasks: TaskRow[]; priorityTasks: PriorityTaskRow[]; events: EventRow[]; invites?: EventInviteRow[]; me?: string | null },
  from: string,
  to: string,
): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const t of data.tasks) {
    if (t.deleted_at || t.status === 'cancelled' || !t.due_date || t.due_date < from || t.due_date > to) continue
    const priority = ['low', 'low', 'medium', 'high'][t.priority ?? 1] ?? 'low'
    items.push({
      id: `task:${t.id}`,
      title: t.title,
      start: t.due_date,
      allDay: true,
      className: ['cal-task', `cal-${priority}`, ...(t.status === 'done' ? ['cal-done'] : [])].join(' '),
      extendedProps: { kind: 'task', itemId: t.id, date: t.due_date },
    })
  }
  for (const p of data.priorityTasks) {
    if (p.deleted_at) continue
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!isTaskScheduled(p, d)) continue
      items.push({
        id: `priority:${p.id}:${d}`,
        title: `⚠ ${p.title}`,
        start: `${d}T${hhmm(p.reminder_time)}`,
        allDay: false,
        className: 'cal-priority',
        extendedProps: { kind: 'priority_task', itemId: p.id, date: d },
      })
    }
  }
  for (const e of data.events) {
    if (e.deleted_at) continue
    // Invited events (SPEC §5): dashed until answered, faded for Maybe, gone after No or dropping out.
    const invited = !!data.me && !!e.user_id && e.user_id !== data.me
    const mine = invited ? data.invites?.find((i) => i.event_id === e.id && !i.deleted_at) : undefined
    if (invited && (!mine || mine.response === 'no' || mine.response === 'dropped')) continue
    const style = [
      'cal-event',
      ...(e.cancelled_at ? ['cal-cancelled'] : []),
      ...(mine?.response === 'pending' ? ['cal-pending'] : []),
      ...(mine?.response === 'maybe' ? ['cal-maybe'] : []),
    ].join(' ')
    const length = daysBetween(e.start_date, e.end_date)
    for (const d of occurrences(e, from, to)) {
      const endDate = addDays(d, length)
      items.push(
        e.start_time && e.end_time
          ? {
              id: `event:${e.id}:${d}`,
              title: e.title,
              start: `${d}T${hhmm(e.start_time)}`,
              end: `${endDate}T${hhmm(e.end_time)}`,
              allDay: false,
              className: style,
              extendedProps: { kind: 'event', itemId: e.id, date: d },
            }
          : {
              id: `event:${e.id}:${d}`,
              title: e.title,
              start: d,
              end: addDays(endDate, 1),
              allDay: true,
              className: style,
              extendedProps: { kind: 'event', itemId: e.id, date: d },
            },
      )
    }
  }
  return items
}

/** A new event: one hour from the chosen time (or the next whole hour), or all day when a day is chosen. */
export function newEvent(userId: string, date: string, time: string | null, id: string = crypto.randomUUID()): EventRow {
  if (!time) {
    return { id, user_id: userId, title: '', notes: null, start_date: date, start_time: null, end_date: date, end_time: null, repeat: 'never', reminder_minutes: null, deleted_at: null }
  }
  const [h, m] = time.split(':').map(Number)
  const endHour = Math.min(h! + 1, 23)
  const end = `${String(endHour).padStart(2, '0')}:${h! + 1 > 23 ? '59' : String(m).padStart(2, '0')}`
  return { id, user_id: userId, title: '', notes: null, start_date: date, start_time: hhmm(time), end_date: date, end_time: end, repeat: 'never', reminder_minutes: null, deleted_at: null }
}

/** Why an event can't be saved yet, if anything is wrong. */
export function eventProblem(e: EventRow): 'title' | 'end' | null {
  if (!e.title.trim()) return 'title'
  if (e.end_date < e.start_date) return 'end'
  if (e.start_time && e.end_time && e.end_date === e.start_date && e.end_time < e.start_time) return 'end'
  return null
}
