import { describe, expect, it } from 'vitest'
import { clearDone, clearedForDay, tasksForDay, toggleDone, undatedTasks } from '@/tasks/rules'
import type { TaskRow } from '@/sync/types'

describe('Spec §5 Tasks: Clear crossed-off hides done tasks but keeps them', () => {
  const TZ = 'America/New_York'
  const t = (id: string, extra: Partial<TaskRow> = {}): TaskRow => ({ id, title: id, due_date: DAY_T, status: 'open', source: 'manual', deleted_at: null, ...extra })
  const DAY_T = '2026-11-10'
  const doneAt = '2026-11-10T15:00:00Z'

  it('only crossed-off tasks are cleared; open ones stay', () => {
    const list = [t('a'), t('b', { status: 'done', completed_at: doneAt })]
    const cleared = clearDone(list, new Date('2026-11-10T16:00:00Z'))
    expect(cleared.map((x) => x.id)).toEqual(['b'])
    expect(cleared[0]!.cleared_at).toBe('2026-11-10T16:00:00.000Z')
    expect(cleared[0]!.deleted_at).toBeNull()
  })

  it('cleared tasks leave the day and Undated lists, but are still kept as cleared', () => {
    const cleared = t('b', { status: 'done', completed_at: doneAt, cleared_at: doneAt })
    const undated = t('u', { due_date: null, status: 'done', completed_at: doneAt, cleared_at: doneAt })
    expect(tasksForDay([cleared, t('a')], DAY_T, DAY_T, TZ).map((x) => x.id)).toEqual(['a'])
    expect(undatedTasks([undated])).toEqual([])
    expect(clearedForDay([cleared], DAY_T, TZ)).toHaveLength(1)
  })

  it('un-crossing a task brings it back to the list', () => {
    expect(toggleDone(t('b', { status: 'done', completed_at: doneAt, cleared_at: doneAt })).cleared_at).toBeNull()
  })
})

