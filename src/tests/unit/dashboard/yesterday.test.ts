import { describe, expect, it } from 'vitest'
import { yesterdaySummary } from '@/dashboard/stats'

describe('Spec §5 Dashboard: How past you did yesterday', () => {
  it('counts habits, tasks and routines finished (every step done), and lists each routine', () => {
    const y = yesterdaySummary({
      tasks: { done: 2, due: 5 },
      habits: { kept: 3, scheduled: 4 },
      routines: [
        { id: 'r1', title: 'Morning', done: 5, total: 5 },
        { id: 'r2', title: 'Night', done: 1, total: 3 },
        { id: 'r3', title: 'Empty', done: 0, total: 0 },
      ],
      priority: [],
      streaks: [],
      quests: [],
    })
    expect(y.habits).toEqual({ kept: 3, scheduled: 4 })
    expect(y.tasks).toEqual({ done: 2, due: 5 })
    expect(y.routines.finished).toBe(1)
    expect(y.routines.total).toBe(2)
    expect(y.routines.list.map((r) => r.title)).toEqual(['Morning', 'Night'])
    expect(y.empty).toBe(false)
  })

  it('is empty when nothing was scheduled or due', () => {
    expect(yesterdaySummary({ tasks: { done: 0, due: 0 }, habits: { kept: 0, scheduled: 0 }, routines: [], priority: [], streaks: [], quests: [] }).empty).toBe(true)
  })
})

