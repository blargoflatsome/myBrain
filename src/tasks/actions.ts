// Writing tasks (SPEC §5 Tasks).
import type { TaskRow } from '@/sync/types'
import { removeWithUndo, type ActionContext } from '@/sync/actions'
import { getRow } from '@/sync/db'
import { DEFAULT_PRIORITY, toggleDone } from '@/tasks/rules'
import { reminderInPast, taskReminder } from '@/reminders/priority'
import { clipTitle } from '@/lib/titles'
import { achieved } from '@/celebrate/bus'
import { saveItemTags } from '@/tags/actions'

/** A new task as Capture, Orphans, the Tasks page or the task editor gives it. */
export type TaskDraft = Partial<Pick<TaskRow, 'id' | 'notes' | 'due_date' | 'priority' | 'reminder_time'>> & {
  title: string
  /** Where it was added: Capture (and Orphans) or the Tasks page. */
  source: 'capture' | 'manual'
  /** Tag names from the editor, saved after the task. */
  tags?: string[]
}

/**
 * The reminder time a new or edited task keeps (only a High task with a date has one), or 'past' when that moment
 * has already gone: saving never sets a reminder off at once (SPEC §5 High-priority tasks). An unchanged reminder is fine.
 */
export function checkedReminder(
  next: { priority?: number; due_date?: string | null; reminder_time?: string | null },
  before: TaskRow | null,
  now = new Date(),
): string | null | 'past' {
  const due_date = next.due_date || null
  const reminder_time = taskReminder(next.priority ?? DEFAULT_PRIORITY, due_date, next.reminder_time)
  return reminderInPast({ due_date, reminder_time }, before, now) ? 'past' : reminder_time
}

/** What + New task opens the editor with: no title yet, on the day I'm looking at (null for Undated). */
export function blankTask(dueDate: string | null): TaskRow {
  return { id: crypto.randomUUID(), user_id: '', title: '', due_date: dueDate, priority: DEFAULT_PRIORITY, status: 'open', source: 'manual', deleted_at: null }
}

export function taskActions({ ready }: ActionContext) {
  /** Add a task (SPEC §5 Tasks). Returns null when it has no title or its reminder has already gone. */
  async function addTask(draft: TaskDraft, now = new Date()) {
    const { engine: e, uid } = ready()
    const title = clipTitle(draft.title)
    const reminder_time = checkedReminder(draft, null, now)
    if (!title || reminder_time === 'past') return null
    const row: TaskRow = {
      id: draft.id ?? crypto.randomUUID(),
      user_id: uid,
      title,
      notes: draft.notes?.trim() || null,
      due_date: draft.due_date || null,
      priority: draft.priority ?? DEFAULT_PRIORITY,
      reminder_time,
      status: 'open',
      source: draft.source,
      // Set here too, so tasks keep the order they were added in before they reach the server.
      created_at: now.toISOString(),
      deleted_at: null,
    }
    const saved = await e.save('tasks', row)
    if (draft.tags) await saveItemTags(ready, 'task', saved.id, draft.tags)
    return saved
  }

  /** Save a task as changed; with `tags` (from the editor), its tags too, after it. */
  async function saveTask(row: TaskRow, tags?: string[]) {
    const { engine: e, uid, local } = ready()
    const before = await local.tasks.get(row.id)
    const saved = await e.save('tasks', { ...row, user_id: uid })
    if (tags) await saveItemTags(ready, 'task', saved.id, tags)
    // Crossed off just now (not a later edit of a task already done): celebrate it (SPEC §5 Celebrations).
    if (row.status === 'done' && before?.status !== 'done') achieved({ kind: 'task', task: row })
    return saved
  }

  /** Delete a task. Returns its Undo (SPEC §2). */
  const deleteTask = (id: string) => removeWithUndo(ready, 'tasks', [id])

  /** Cross a task off if it is still open (never un-crosses it), for "Do it" and the slide to complete. */
  async function completeTask(id: string, now = new Date()) {
    const task = await getRow(ready().local, 'tasks', id)
    if (task?.status === 'open') await saveTask(toggleDone(task, now))
  }

  return { addTask, saveTask, completeTask, deleteTask }
}
