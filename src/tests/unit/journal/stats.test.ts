import { describe, expect, it } from 'vitest'
import type { HabitLogRow, HabitRow, JournalEntryRow, JournalStats } from '@/sync/types'
import { dayStats, emptyEntry, entryIdFor, hadActivity, missingDays, statsUpdate, type DayData } from '@/journal/stats'

const TZ = 'America/New_York'
const UID = '11111111-2222-4333-8444-555555555555'
// Tue Nov 10 2026, 9 pm in New York.
const NOW = new Date('2026-11-11T02:00:00Z')

function habit(id: string, extra: Partial<HabitRow> = {}): HabitRow {
  return {
    id,
    title: id,
    notify_time: null,
    timer_minutes: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    start_date: '2026-11-01',
    is_private: false,
    current_streak: 0,
    best_streak: 0,
    deleted_at: null,
    ...extra,
  }
}
const done = (habitId: string, date: string): HabitLogRow => ({
  id: `${habitId}-${date}`,
  habit_id: habitId,
  date,
  status: 'completed',
  completed_at: `${date}T15:00:00Z`,
  deleted_at: null,
})
const missed = (habitId: string, date: string): HabitLogRow => ({ id: `${habitId}-${date}`, habit_id: habitId, date, status: 'missed', deleted_at: null })

function data(extra: Partial<DayData> = {}): DayData {
  return {
    tasks: [],
    habits: [],
    habitLogs: [],
    routines: [],
    routineSteps: [],
    routineRuns: [],
    routineStepLogs: [],
    priorityTasks: [],
    priorityTaskLogs: [],
    quests: [],
    questLogs: [],
    ...extra,
  }
}

describe('Spec §5 Journal: the day’s stats', () => {
  it('tasks done counts tasks finished that day out of tasks due or finished that day', () => {
    const s = dayStats(
      data({
        tasks: [
          { id: 'a', title: 'due, done', due_date: '2026-11-10', status: 'done', completed_at: '2026-11-10T18:00:00Z', source: 'manual', deleted_at: null },
          { id: 'b', title: 'due, open', due_date: '2026-11-10', status: 'open', source: 'manual', deleted_at: null },
          { id: 'c', title: 'carried over, done today', due_date: '2026-11-08', status: 'done', completed_at: '2026-11-10T19:00:00Z', source: 'manual', deleted_at: null },
          { id: 'd', title: 'cancelled', due_date: '2026-11-10', status: 'cancelled', source: 'manual', deleted_at: null },
          { id: 'e', title: 'deleted', due_date: '2026-11-10', status: 'open', source: 'manual', deleted_at: '2026-11-10T01:00:00Z' },
          { id: 'f', title: 'tomorrow', due_date: '2026-11-11', status: 'open', source: 'manual', deleted_at: null },
        ],
      }),
      '2026-11-10',
      NOW,
      TZ,
    )
    expect(s.tasks).toEqual({ done: 2, due: 3 })
  })

  it('habits kept counts completed habits out of habits scheduled that day', () => {
    const s = dayStats(
      data({
        habits: [habit('meds'), habit('run', { weekdays: [1] }), habit('read')],
        habitLogs: [done('meds', '2026-11-10')],
      }),
      '2026-11-10',
      NOW,
      TZ,
    )
    expect(s.habits).toEqual({ kept: 1, scheduled: 2 })
  })

  it('routines show how many steps were completed out of the routine’s steps', () => {
    const s = dayStats(
      data({
        routines: [{ id: 'r', title: 'Morning', notify_time: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null }],
        routineSteps: ['s1', 's2', 's3', 's4'].map((id, position) => ({ id, routine_id: 'r', position, title: id, start_date: '2026-11-01', deleted_at: null })),
        routineRuns: [{ id: 'run', routine_id: 'r', date: '2026-11-10', started_at: '2026-11-10T12:00:00Z', finished_at: null, deleted_at: null }],
        routineStepLogs: [
          { id: 'l1', run_id: 'run', step_id: 's1', status: 'completed', logged_at: '', deleted_at: null },
          { id: 'l2', run_id: 'run', step_id: 's2', status: 'skipped', logged_at: '', deleted_at: null },
          { id: 'l3', run_id: 'run', step_id: 's3', status: 'completed', logged_at: '', deleted_at: null },
        ],
      }),
      '2026-11-10',
      NOW,
      TZ,
    )
    expect(s.routines).toEqual([{ id: 'r', title: 'Morning', done: 2, total: 4 }])
  })

  it('priority habits and priority tasks are listed with whether they were completed', () => {
    const s = dayStats(
      data({
        habits: [habit('Meds', { is_priority: true })],
        habitLogs: [done('Meds', '2026-11-10')],
        priorityTasks: [
          { id: 'p1', title: 'Insulin', reminder_time: '12:00', due_date: null, weekdays: [2], start_date: '2026-11-01', deleted_at: null },
          { id: 'p2', title: 'Booster', reminder_time: '09:00', due_date: '2026-11-12', weekdays: null, start_date: '2026-11-01', deleted_at: null },
        ],
      }),
      '2026-11-10',
      NOW,
      TZ,
    )
    expect(s.priority).toEqual([
      { title: 'Meds', done: true },
      { title: 'Insulin', done: false },
    ])
  })

  it('streaks reached that day, and streaks reset that day, are noted', () => {
    const s = dayStats(
      data({
        habits: [habit('Meds'), habit('Stretch')],
        habitLogs: [
          ...['2026-11-08', '2026-11-09', '2026-11-10'].map((d) => done('Meds', d)),
          ...['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'].map((d) => done('Stretch', d)),
          missed('Stretch', '2026-11-10'),
          missed('Meds', '2026-11-07'),
        ],
      }),
      '2026-11-10',
      new Date('2026-11-12T12:00:00Z'),
      TZ,
    )
    expect(s.streaks).toEqual([
      { title: 'Meds', kind: 'reached', days: 3 },
      { title: 'Stretch', kind: 'reset', days: 9 },
    ])
  })

  it('a habit still open today is neither kept nor reset yet', () => {
    const s = dayStats(data({ habits: [habit('Meds')], habitLogs: [done('Meds', '2026-11-09')] }), '2026-11-10', NOW, TZ)
    expect(s.habits).toEqual({ kept: 0, scheduled: 1 })
    expect(s.streaks).toEqual([])
  })

  it('quests done that day are listed, from the completion log (a quest can be done again)', () => {
    const s = dayStats(
      data({
        quests: [
          { id: 'q1', title: 'Paint the fence', status: 'open', completed_at: '2026-11-11T03:00:00Z', deleted_at: null },
          { id: 'q2', title: 'Yesterday', status: 'open', completed_at: '2026-11-10T03:00:00Z', deleted_at: null },
          { id: 'q3', title: 'Open', status: 'open', deleted_at: null },
        ],
        questLogs: [
          { id: 'l1', quest_id: 'q1', date: '2026-11-10', completed_at: '2026-11-11T03:00:00Z', deleted_at: null }, // 10 pm Nov 10 NY
          { id: 'l2', quest_id: 'q2', date: '2026-11-09', completed_at: '2026-11-10T03:00:00Z', deleted_at: null },
          { id: 'l3', quest_id: 'q1', date: '2026-11-08', completed_at: '2026-11-09T03:00:00Z', deleted_at: null },
        ],
      }),
      '2026-11-10',
      new Date('2026-11-11T12:00:00Z'),
      TZ,
    )
    expect(s.quests).toEqual(['Paint the fence'])
  })
})

describe('Spec §5 Journal: missed days are logged for me', () => {
  const entry = (date: string, extra: Partial<JournalEntryRow> = {}): JournalEntryRow => ({ ...emptyEntry(UID, date, false), ...extra })

  it('nothing is missing on the day I start journaling, and no earlier days are invented', () => {
    expect(missingDays([], '2026-11-10', '2026-11-10')).toEqual([])
  })
  it('each day since I started that ended without an entry is missing; today is never missing', () => {
    expect(missingDays([entry('2026-11-08')], '2026-11-10', '2026-11-06')).toEqual(['2026-11-06', '2026-11-07', '2026-11-09'])
  })
  it('an entry older than this device’s start date (from another device) moves the start back', () => {
    expect(missingDays([entry('2026-11-06'), entry('2026-11-08')], '2026-11-10', '2026-11-09')).toEqual(['2026-11-07', '2026-11-09'])
  })
  it('a deleted entry does not count as written', () => {
    expect(missingDays([entry('2026-11-08'), entry('2026-11-09', { deleted_at: 'x' })], '2026-11-10', '2026-11-08')).toEqual(['2026-11-09'])
  })
  it('a day’s entry has the same id on every device', () => {
    expect(entryIdFor(UID, '2026-11-10')).toBe('11111111-2222-4333-8444-202611100000')
  })
})

describe('Spec §5 Journal: stats are live until midnight, then frozen', () => {
  const stats = (done: number): JournalStats => ({ tasks: { done, due: 3 }, habits: { kept: 0, scheduled: 0 }, routines: [], priority: [], streaks: [], quests: [] })
  const entry = (date: string, extra: Partial<JournalEntryRow> = {}): JournalEntryRow => ({ ...emptyEntry(UID, date, false), ...extra })

  it('today’s stats update when they change', () => {
    expect(statsUpdate(entry('2026-11-10', { stats: stats(1) }), stats(2), '2026-11-10')).toEqual({ stats: stats(2) })
    expect(statsUpdate(entry('2026-11-10', { stats: stats(2) }), stats(2), '2026-11-10')).toBeNull()
  })
  it('once the day has ended the stats are written one last time and frozen', () => {
    expect(statsUpdate(entry('2026-11-09', { stats: stats(2) }), stats(2), '2026-11-10')).toEqual({ stats: stats(2), stats_final: true })
  })
  it('frozen stats never change', () => {
    expect(statsUpdate(entry('2026-11-09', { stats: stats(2), stats_final: true }), stats(3), '2026-11-10')).toBeNull()
  })
})

describe('Spec §5 Journal: an entry is only written for me if I did something that day', () => {
  const none: JournalStats = { tasks: { done: 0, due: 3 }, habits: { kept: 0, scheduled: 2 }, routines: [{ id: 'r', title: 'R', done: 0, total: 4 }], priority: [{ title: 'Meds', done: false }], streaks: [{ title: 'Stretch', kind: 'reset', days: 5 }], quests: [] }
  it('a day with nothing completed (even with a streak reset) had no activity', () => {
    expect(hadActivity(none)).toBe(false)
  })
  it.each([
    ['a task', { tasks: { done: 1, due: 3 } }],
    ['a habit', { habits: { kept: 1, scheduled: 2 } }],
    ['a routine step', { routines: [{ id: 'r', title: 'R', done: 1, total: 4 }] }],
    ['a priority item', { priority: [{ title: 'Meds', done: true }] }],
    ['a quest', { quests: ['Paint the fence'] }],
  ])('completing %s counts as activity', (_name, change) => {
    expect(hadActivity({ ...none, ...change } as JournalStats)).toBe(true)
  })
})
