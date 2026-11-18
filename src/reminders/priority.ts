// Priority reminders in the app (SPEC §5 High-priority tasks and priority habits): which ones are due right now.
// The server sends the notifications; the app shows the full-screen reminder while one is due.
import type { HabitLogRow, HabitPauseRow, HabitRow, ReminderStateRow, TaskRow } from '@/sync/types'
import { dayStatus, isScheduled, zonedTime } from '@/habits/rules'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { HIGH } from '@/tasks/rules'

export const SNOOZE_MINUTES = 10

export interface DuePriority {
  kind: 'habit' | 'task'
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

/** SPEC §5 High-priority tasks: a reminder must be later than now (a task on an earlier day counts as today's). */
export function isLater(date: string, time: string, today: string, nowTime: string): boolean {
  return date > today || time.slice(0, 5) > nowTime
}

/** SPEC §5 High-priority tasks: only a High task with a date keeps a reminder time; otherwise it's cleared. */
export function taskReminder(priority: number, dueDate: string | null, time: string | null | undefined): string | null {
  return priority === HIGH && dueDate && time ? time.slice(0, 5) : null
}

/**
 * Whether a task's new reminder would go off at once: a changed reminder (or date) must be later than now. An unchanged
 * one is fine, so editing a task whose reminder already went off today still saves.
 */
export function reminderInPast(
  next: { due_date: string | null; reminder_time: string | null },
  before: { due_date: string | null; reminder_time?: string | null } | null,
  now: Date = new Date(),
): boolean {
  if (!next.reminder_time || !next.due_date) return false
  if (before && before.reminder_time?.slice(0, 5) === next.reminder_time && before.due_date === next.due_date) return false
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const today = todayIn(deviceTimeZone(), now)
  return !isLater(next.due_date, next.reminder_time, today, nowTime)
}

/**
 * SPEC §5 High-priority tasks: an open High task with a reminder time is reminded on its day, and each later day while
 * it carries over. Times are "HH:MM" in my time zone.
 */
export function remindsOn(task: TaskRow, date: string): task is TaskRow & { due_date: string; reminder_time: string } {
  return !task.deleted_at && task.status === 'open' && task.priority === HIGH && !!task.reminder_time && !!task.due_date && task.due_date <= date
}

export function duePriorities(
  habits: HabitRow[],
  habitLogs: HabitLogRow[],
  tasks: TaskRow[],
  states: ReminderStateRow[],
  now: Date,
  timeZone: string,
  pauses: HabitPauseRow[] = [],
): DuePriority[] {
  const today = todayIn(timeZone, now)
  const due: DuePriority[] = []

  for (const h of habits) {
    if (h.deleted_at || !h.is_priority || !h.notify_time || !isScheduled(h, today)) continue
    if (now.getTime() < zonedTime(today, h.notify_time, timeZone)) continue
    // Only while it can still be completed today (not done, timer not run out).
    // Paused habits (SPEC §5 Habits Pause streaks) give no reminder either.
    if (dayStatus(h, today, habitLogs, now, timeZone, pauses) !== 'open') continue
    if (held(stateFor(states, h.id, today), now)) continue
    due.push({ kind: 'habit', id: h.id, title: h.title, description: null, date: today })
  }

  for (const t of tasks) {
    if (!remindsOn(t, today)) continue
    if (now.getTime() < zonedTime(today, t.reminder_time, timeZone)) continue
    if (held(stateFor(states, t.id, today), now)) continue
    due.push({ kind: 'task', id: t.id, title: t.title, description: t.notes ?? null, date: today })
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
