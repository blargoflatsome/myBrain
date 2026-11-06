import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskRow } from '@/sync/types'
import { addDays, daysBetween, todayIn } from './days'
import { cancelTask, carryOverCount, needsDecision, priorityKey, tasksForDay, toggleDone, undatedTasks } from './rules'

const NY = 'America/New_York'

function task(over: Partial<TaskRow>): TaskRow {
  return { id: crypto.randomUUID(), title: 't', due_date: null, status: 'open', source: 'manual', priority: 1, deleted_at: null, ...over }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Spec §5 Tasks: the day ends at midnight in my timezone', () => {
  it('11:59 pm in New York is still the same day there, even though it is tomorrow in UTC', () => {
    vi.setSystemTime(new Date('2026-11-10T04:59:00Z')) // 23:59 EST on Nov 9
    expect(todayIn(NY)).toBe('2026-11-09')
    expect(todayIn('UTC')).toBe('2026-11-10')
  })

  it('one minute after midnight in New York it is the next day', () => {
    vi.setSystemTime(new Date('2026-11-10T05:01:00Z')) // 00:01 EST on Nov 10
    expect(todayIn(NY)).toBe('2026-11-10')
  })

  it('a task due yesterday carries over exactly at local midnight', () => {
    const t = task({ due_date: '2026-11-09' })
    vi.setSystemTime(new Date('2026-11-10T04:59:00Z'))
    expect(carryOverCount(t, todayIn(NY))).toBe(0)
    vi.setSystemTime(new Date('2026-11-10T05:00:00Z'))
    expect(carryOverCount(t, todayIn(NY))).toBe(1)
  })
})

describe('Spec §5 Tasks: carry-over is worked out from dates, not a running counter', () => {
  it('is correct after the app was closed for several days', () => {
    const t = task({ due_date: '2026-11-01' })
    vi.setSystemTime(new Date('2026-11-05T15:00:00Z'))
    expect(carryOverCount(t, todayIn(NY))).toBe(4)
  })

  it('a task carried over once shows on today without Cancel/Edit; twice shows them', () => {
    expect(needsDecision(task({ due_date: '2026-11-09' }), '2026-11-10')).toBe(false)
    expect(needsDecision(task({ due_date: '2026-11-08' }), '2026-11-10')).toBe(true)
  })

  it('undated, done and cancelled tasks never carry over', () => {
    expect(carryOverCount(task({ due_date: null }), '2026-11-10')).toBe(0)
    expect(carryOverCount(task({ due_date: '2026-11-01', status: 'done' }), '2026-11-10')).toBe(0)
    expect(carryOverCount(task({ due_date: '2026-11-01', status: 'cancelled' }), '2026-11-10')).toBe(0)
  })

  it('a task scheduled for a future day has not carried over', () => {
    expect(carryOverCount(task({ due_date: '2026-11-12' }), '2026-11-10')).toBe(0)
  })
})

describe('Spec §3/§5: daylight saving changes do not skip or double a day', () => {
  it('spring forward (Mar 8 2026, a 23-hour day) counts as one day', () => {
    const t = task({ due_date: '2026-03-07' })
    vi.setSystemTime(new Date('2026-03-08T05:30:00Z')) // 00:30 EST Mar 8
    expect(carryOverCount(t, todayIn(NY))).toBe(1)
    vi.setSystemTime(new Date('2026-03-09T03:59:00Z')) // 23:59 EDT Mar 8
    expect(carryOverCount(t, todayIn(NY))).toBe(1)
    vi.setSystemTime(new Date('2026-03-09T04:00:00Z')) // 00:00 EDT Mar 9
    expect(carryOverCount(t, todayIn(NY))).toBe(2)
  })

  it('fall back (Nov 1 2026, a 25-hour day) counts as one day', () => {
    const t = task({ due_date: '2026-10-31' })
    vi.setSystemTime(new Date('2026-11-01T04:30:00Z')) // 00:30 EDT Nov 1
    expect(carryOverCount(t, todayIn(NY))).toBe(1)
    vi.setSystemTime(new Date('2026-11-02T04:59:00Z')) // 23:59 EST Nov 1
    expect(carryOverCount(t, todayIn(NY))).toBe(1)
    vi.setSystemTime(new Date('2026-11-02T05:00:00Z')) // 00:00 EST Nov 2
    expect(carryOverCount(t, todayIn(NY))).toBe(2)
  })

  it('day arithmetic is exact across both changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })
})

describe('Spec §5 Tasks: stays correct when I travel across timezones', () => {
  it('the same moment can be different days in Tokyo and Los Angeles; carry-over follows where I am', () => {
    const t = task({ due_date: '2026-11-09' })
    vi.setSystemTime(new Date('2026-11-10T03:00:00Z')) // Nov 10 noon in Tokyo, Nov 9 7pm in LA
    expect(carryOverCount(t, todayIn('Asia/Tokyo'))).toBe(1)
    expect(carryOverCount(t, todayIn('America/Los_Angeles'))).toBe(0)
  })
})

describe('Spec §5 Tasks: daily list, scheduling, and the Undated list', () => {
  const today = '2026-11-10'
  const all = [
    task({ id: 'today-low', due_date: today, priority: 1, created_at: '1' }),
    task({ id: 'today-high', due_date: today, priority: 3, created_at: '2' }),
    task({ id: 'today-med', due_date: today, priority: 2, created_at: '3' }),
    task({ id: 'carried', due_date: '2026-11-08', priority: 1, created_at: '0' }),
    task({ id: 'done-today', due_date: today, status: 'done', priority: 3 }),
    task({ id: 'done-old', due_date: '2026-11-08', status: 'done' }),
    task({ id: 'future', due_date: '2026-11-12' }),
    task({ id: 'undated', due_date: null }),
    task({ id: 'cancelled', due_date: today, status: 'cancelled' }),
    task({ id: 'deleted', due_date: today, deleted_at: '2026-11-10T00:00:00Z' }),
  ]

  it("today's list: carried-over tasks join it, open tasks by priority High→Medium→Low, crossed-off ones last", () => {
    expect(tasksForDay(all, today, today).map((t) => t.id)).toEqual(['today-high', 'today-med', 'carried', 'today-low', 'done-today'])
  })

  it('a future day shows only what is scheduled for it', () => {
    expect(tasksForDay(all, '2026-11-12', today).map((t) => t.id)).toEqual(['future'])
  })

  it('a past day shows what was finished that day, not tasks that carried forward', () => {
    expect(tasksForDay(all, '2026-11-08', today).map((t) => t.id)).toEqual(['done-old'])
  })

  it('the Undated list holds only undated tasks', () => {
    expect(undatedTasks(all).map((t) => t.id)).toEqual(['undated'])
  })

  it('a carried-over task crossed off today stays on today, crossed off', () => {
    const t = task({ id: 'late', due_date: '2026-11-08', status: 'done', completed_at: '2026-11-10T15:00:00Z' })
    expect(tasksForDay([t], today, today, NY).map((x) => x.id)).toEqual(['late'])
    expect(tasksForDay([t], '2026-11-08', today, NY)).toEqual([])
  })

  it('completing crosses a task off and records when; tapping again un-crosses it', () => {
    const done = toggleDone(task({ id: 'x' }), new Date('2026-11-10T12:00:00Z'))
    expect(done).toMatchObject({ status: 'done', completed_at: '2026-11-10T12:00:00.000Z' })
    expect(toggleDone(done)).toMatchObject({ status: 'open', completed_at: null })
  })

  it('Cancel removes a task from the lists but keeps it in history', () => {
    const c = cancelTask(task({ due_date: today }))
    expect(c.status).toBe('cancelled')
    expect(c.deleted_at).toBeNull()
    expect(tasksForDay([c], today, today)).toEqual([])
  })
})

describe('Spec §5 Tasks: priority levels', () => {
  it('maps 3/2/1 to High/Medium/Low and anything else to Low (the default)', () => {
    expect([3, 2, 1, 0, undefined].map(priorityKey)).toEqual(['high', 'medium', 'low', 'low', 'low'])
  })
})
