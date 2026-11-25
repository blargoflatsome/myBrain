// Writing tasks (SPEC §5 Tasks).
import type { TaskRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { getRow } from '@/sync/db'
import { toggleDone } from '@/tasks/rules'
import { achieved } from '@/celebrate/bus'

export function taskActions({ ready }: ActionContext) {
  async function saveTask(row: TaskRow) {
    const { engine: e, local } = ready()
    const before = await local.tasks.get(row.id)
    const saved = await e.save('tasks', row)
    // Crossed off just now (not a later edit of a task already done): celebrate it (SPEC §5 Celebrations).
    if (row.status === 'done' && before?.status !== 'done') achieved({ kind: 'task', task: row })
    return saved
  }

  /** Cross a task off if it is still open (never un-crosses it), for "Do it" and the slide to complete. */
  async function completeTask(id: string, now = new Date()) {
    const task = await getRow(ready().local, 'tasks', id)
    if (task?.status === 'open') await saveTask(toggleDone(task, now))
  }

  return { saveTask, completeTask }
}
