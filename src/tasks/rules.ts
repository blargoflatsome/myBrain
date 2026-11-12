// Task rules (SPEC §5 Tasks): which tasks show on a day, carry-over, priority order.
import type { TaskRow } from '@/sync/types'
import { daysBetween, todayIn } from './days'

export const PRIORITIES = [
  { level: 3, key: 'high' },
  { level: 2, key: 'medium' },
  { level: 1, key: 'low' },
] as const
export type PriorityKey = (typeof PRIORITIES)[number]['key']
export const DEFAULT_PRIORITY = 1

export function priorityKey(level: number | undefined): PriorityKey {
  return PRIORITIES.find((p) => p.level === level)?.key ?? 'low'
}

/**
 * How many times an open task has carried over: whole days past its due date, counted from today's date
 * (not from a counter that only runs while the app is open). Undated, done and cancelled tasks never carry over.
 */
export function carryOverCount(task: TaskRow, today: string): number {
  if (task.status !== 'open' || !task.due_date) return 0
  return Math.max(0, daysBetween(task.due_date, today))
}

/** A task that carried over a second time gets Tomorrow, Undated and Cancel task (SPEC §5 Tasks). */
export function needsDecision(task: TaskRow, today: string): boolean {
  return carryOverCount(task, today) >= 2
}

function byPriorityThenAge(a: TaskRow, b: TaskRow) {
  return (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY) || (a.created_at ?? '').localeCompare(b.created_at ?? '')
}

/** The day a finished task belongs to: the day it was crossed off, or its due day if that is later. */
function doneDay(task: TaskRow, timeZone: string): string {
  const completed = task.completed_at ? todayIn(timeZone, new Date(task.completed_at)) : task.due_date!
  return completed > task.due_date! ? completed : task.due_date!
}

/**
 * The list for a day. Today's list also holds every open task carried over from earlier days, and a
 * carried-over task crossed off today stays on today. Open tasks come first by priority, then crossed-off
 * ones. Past days show only what was finished then. Deleted and cancelled tasks are hidden.
 */
export function tasksForDay(tasks: TaskRow[], day: string, today: string, timeZone = 'UTC'): TaskRow[] {
  const visible = tasks.filter((t) => !t.deleted_at && t.status !== 'cancelled' && t.due_date)
  const open = visible.filter(
    (t) => t.status === 'open' && ((t.due_date === day && day >= today) || (day === today && t.due_date! < today)),
  )
  const done = visible.filter((t) => t.status === 'done' && !t.cleared_at && doneDay(t, timeZone) === day)
  return [...open.sort(byPriorityThenAge), ...done.sort(byPriorityThenAge)]
}

/** Tasks crossed off on a day and then cleared from its list (they still count, SPEC §5 Tasks). */
export function clearedForDay(tasks: TaskRow[], day: string, timeZone = 'UTC'): TaskRow[] {
  return tasks.filter((t) => !t.deleted_at && t.status === 'done' && !!t.cleared_at && !!t.due_date && doneDay(t, timeZone) === day)
}

/** "Clear crossed-off" (SPEC §5 Tasks): the done tasks in a list, hidden from it but kept for history and stats. */
export function clearDone(list: TaskRow[], now: Date = new Date()): TaskRow[] {
  return list.filter((t) => t.status === 'done' && !t.cleared_at).map((t) => ({ ...t, cleared_at: now.toISOString() }))
}

/** The Undated list: tasks with no due date. They never carry over. */
export function undatedTasks(tasks: TaskRow[]): TaskRow[] {
  const visible = tasks.filter((t) => !t.deleted_at && t.status !== 'cancelled' && !t.due_date && !(t.status === 'done' && t.cleared_at))
  return [...visible.filter((t) => t.status === 'open').sort(byPriorityThenAge), ...visible.filter((t) => t.status === 'done')]
}

/** Completing crosses a task off; tapping again un-crosses it. */
export function toggleDone(task: TaskRow, now: Date = new Date()): TaskRow {
  return task.status === 'done'
    ? { ...task, status: 'open', completed_at: null, cleared_at: null }
    : { ...task, status: 'done', completed_at: now.toISOString() }
}

export function cancelTask(task: TaskRow): TaskRow {
  return { ...task, status: 'cancelled' }
}

/** The task moved to another day, or to Undated with null; its carry-over starts again from the new day. */
export function moveTask(task: TaskRow, dueDate: string | null): TaskRow {
  return { ...task, due_date: dueDate }
}
