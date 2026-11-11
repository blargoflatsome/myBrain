// Priority reminders in the app (SPEC §5 Priority tasks and priority habits): which ones are due right now.
// The server sends the notifications; the app shows the full-screen reminder while one is due.
import type { HabitLogRow, HabitRow, PriorityTaskLogRow, PriorityTaskRow, ReminderStateRow } from '@/sync/types'
import { dayStatus, isScheduled, weekdayOf, zonedTime } from '@/habits/rules'
import { addDays, onWeek, todayIn } from '@/tasks/days'

export const SNOOZE_MINUTES = 10

export interface DuePriority {
  kind: 'habit' | 'priority_task'
  id: string
  title: string
  description: string | null
  date: string
}

/** Fixed id for an item's reminder state on a day, the same on every device (SPEC §7). */
export function reminderStateId(itemId: string, date: string): string {
  return `${itemId.slice(0, 24)}${date.replaceAll('-', '')}0000`
}

function stateFor(states: ReminderStateRow[], itemId: string, date: string) {
  return states.find((s) => s.item_id === itemId && s.date === date && !s.deleted_at)
}

/** Snoozed reminders wait until the snooze ends; cancelled ones stay away for the day. */
function held(state: ReminderStateRow | undefined, now: Date): boolean {
  if (!state) return false
  if (state.cancelled_at) return true
  return !!state.snoozed_until && new Date(state.snoozed_until).getTime() > now.getTime()
}

/** SPEC §5 Priority tasks: a repeating one starts today if its time is still to come, otherwise tomorrow, so it never
 * goes off the moment it's saved. Times are "HH:MM" in my time zone. */
export function firstFutureDay(time: string, today: string, nowTime: string): string {
  return time.slice(0, 5) > nowTime ? today : addDays(today, 1)
}

/** SPEC §5 Priority tasks: a one-off reminder must be later than now. */
export function isLater(date: string, time: string, today: string, nowTime: string): boolean {
  return date > today || (date === today && time.slice(0, 5) > nowTime)
}

export function isTaskScheduled(task: PriorityTaskRow, date: string): boolean {
  if (task.due_date) return task.due_date === date
  return date >= task.start_date && (task.weekdays ?? []).includes(weekdayOf(date)) && onWeek(task.start_date, task.week_interval, date)
}

export function duePriorities(
  habits: HabitRow[],
  habitLogs: HabitLogRow[],
  tasks: PriorityTaskRow[],
  taskLogs: PriorityTaskLogRow[],
  states: ReminderStateRow[],
  now: Date,
  timeZone: string,
): DuePriority[] {
  const today = todayIn(timeZone, now)
  const due: DuePriority[] = []

  for (const h of habits) {
    if (h.deleted_at || !h.is_priority || !h.notify_time || !isScheduled(h, today)) continue
    if (now.getTime() < zonedTime(today, h.notify_time, timeZone)) continue
    // Only while it can still be completed today (not done, timer not run out).
    if (dayStatus(h, today, habitLogs, now, timeZone) !== 'open') continue
    if (held(stateFor(states, h.id, today), now)) continue
    due.push({ kind: 'habit', id: h.id, title: h.title, description: null, date: today })
  }

  for (const t of tasks) {
    if (t.deleted_at || !isTaskScheduled(t, today)) continue
    if (now.getTime() < zonedTime(today, t.reminder_time, timeZone)) continue
    if (taskLogs.some((l) => l.task_id === t.id && l.date === today && !l.deleted_at)) continue
    if (held(stateFor(states, t.id, today), now)) continue
    due.push({ kind: 'priority_task', id: t.id, title: t.title, description: t.description ?? null, date: today })
  }
  return due
}

/** The state row to save for a snooze or cancel (keeps whatever the server already wrote). */
export function snoozeState(
  item: DuePriority,
  existing: ReminderStateRow | undefined,
  userId: string,
  now: Date,
  minutes = SNOOZE_MINUTES,
): ReminderStateRow {
  return {
    ...(existing ?? { id: reminderStateId(item.id, item.date), kind: item.kind, item_id: item.id, date: item.date, deleted_at: null }),
    user_id: userId,
    snoozed_until: new Date(now.getTime() + minutes * 60_000).toISOString(),
  }
}

export function cancelState(item: DuePriority, existing: ReminderStateRow | undefined, userId: string, now: Date): ReminderStateRow {
  return {
    ...(existing ?? { id: reminderStateId(item.id, item.date), kind: item.kind, item_id: item.id, date: item.date, deleted_at: null }),
    user_id: userId,
    cancelled_at: now.toISOString(),
  }
}
