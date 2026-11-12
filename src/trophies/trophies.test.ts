// SPEC §5 Trophies: what history earns, levels, and comebacks.
import { describe, expect, it } from 'vitest'
import { journalComeback, localMoment, newLevels, shownLevel, taskComeback, trophyStates, trophyValues, type TrophyHistory } from '@/trophies/rules'
import { levelFor, TIERS, TROPHIES, trophyRowId } from '@/trophies/definitions'
import { badgeId, BADGES } from '@/celebrate/rules'
import type { HabitRow, JournalEntryRow, TaskRow } from '@/sync/types'
import { addDays } from '@/tasks/days'

const TZ = 'America/New_York'
const U = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-10T17:00:00Z') // Tue Nov 10, noon in New York
const empty = (): TrophyHistory => ({
  tasks: [], habits: [], habitLogs: [], routines: [], routineRuns: [], journalEntries: [], quests: [], questLogs: [], vaultItems: [],
  vaultBuckets: [], priorityTasks: [], priorityLogs: [], events: [], invites: [], activity: [], userId: U, accountCreated: null, connections: null, blocks: null,
})
const habit = (id: string, extra: Partial<HabitRow> = {}): HabitRow => ({ id, title: id, notify_time: null, timer_minutes: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-10-01', is_private: false, deleted_at: null, ...extra })
const done = (habitId: string, date: string) => ({ id: `${habitId}-${date}`, habit_id: habitId, date, status: 'completed' as const, completed_at: `${date}T15:00:00Z`, deleted_at: null })
const task = (id: string, extra: Partial<TaskRow> = {}): TaskRow => ({ id, title: id, due_date: '2026-11-10', status: 'open', source: 'manual', deleted_at: null, ...extra })
const entry = (date: string, extra: Partial<JournalEntryRow> = {}): JournalEntryRow => ({ id: date, date, body: '<p>words here</p>', deleted_at: null, ...extra }) as JournalEntryRow
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))
const values = (h: Partial<TrophyHistory>) => trophyValues({ ...empty(), ...h }, NOW, TZ)

describe('SPEC §5 Trophies: tiers and levels', () => {
  it('has six tiers, Bronze to Legendary, and a level is how many thresholds are reached', () => {
    expect(TIERS).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary'])
    const streak = TROPHIES.find((t) => t.id === 'habit_streak')!
    expect(streak.levels).toEqual([3, 7, 30, 60, 182, 365])
    expect([2, 3, 7, 29, 365].map((v) => levelFor(streak, v))).toEqual([0, 1, 2, 2, 6])
  })
  it('trophy row ids are the same on every device and never collide with first-time badges', () => {
    const ids = [...TROPHIES.map((t) => trophyRowId(U, t.id)), ...BADGES.map((b) => badgeId(U, b))]
    expect(new Set(ids).size).toBe(ids.length)
    expect(trophyRowId(U, 'habit_streak')).toBe(trophyRowId(U, 'habit_streak'))
  })
  it('a level is never taken away: the shown level is the saved one when history says less', () => {
    const [state] = trophyStates({ habit_streak: 2 }, [{ id: 'x', kind: 'habit_streak', earned_at: '2026-11-01T00:00:00Z', levels: ['a', 'b'], deleted_at: null }])
    expect(shownLevel(state!)).toBe(2)
    expect(newLevels([state!])).toEqual([])
  })
})

describe('SPEC §5 Trophies: streaks', () => {
  it('habit streak is my best run on any habit; missing a day afterwards keeps it', () => {
    const logs = days('2026-10-01', 8).map((d) => done('h1', d))
    expect(values({ habits: [habit('h1')], habitLogs: logs }).habit_streak).toBe(8)
  })
  it('a habit that is not daily counts its scheduled days (7 Thursdays in a row is a week)', () => {
    const thursdays = days('2026-09-24', 7).map((_, i) => addDays('2026-09-24', i * 7))
    const h = habit('thu', { weekdays: [4], start_date: '2026-09-24' })
    expect(values({ habits: [h], habitLogs: thursdays.map((d) => done('thu', d)) }).habit_streak).toBe(7)
  })
  it('journal streak counts entries I wrote, not ones the app wrote', () => {
    const entries = [...days('2026-11-01', 3).map((d) => entry(d)), entry('2026-11-04', { auto: true }), entry('2026-11-05')]
    expect(values({ journalEntries: entries }).journal_streak).toBe(3)
  })
  it('good days: my best run of Yes answers', () => {
    const entries = [...days('2026-11-01', 4).map((d) => entry(d, { better_than_yesterday: true })), entry('2026-11-05', { better_than_yesterday: false })]
    expect(values({ journalEntries: entries }).good_days).toBe(4)
  })
  it('perfect-day streak skips days with no habit scheduled', () => {
    const h = habit('mwf', { weekdays: [1, 3, 5], start_date: '2026-11-02' })
    expect(values({ habits: [h], habitLogs: ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09'].map((d) => done('mwf', d)) }).perfect_streak).toBe(4)
  })
})

describe('SPEC §5 Trophies: totals', () => {
  it('counts tasks created and completed, habit check-ins and quests finished', () => {
    const v = values({
      tasks: [task('a', { status: 'done', completed_at: '2026-11-09T15:00:00Z' }), task('b'), task('c', { deleted_at: '2026-11-01T00:00:00Z' })],
      habits: [habit('h1')],
      habitLogs: [done('h1', '2026-11-01'), done('h1', '2026-11-02')],
      questLogs: [{ id: 'q', quest_id: 'q1', date: '2026-11-01', completed_at: '2026-11-01T12:00:00Z', deleted_at: null }],
    })
    expect(v).toMatchObject({ tasks_created: 3, tasks_completed: 1, habits_created: 1, habit_checkins: 2, quests_finished: 1 })
  })
})

describe('SPEC §5 Trophies: brain dumps and focus (from the activity log)', () => {
  const act = (kind: 'focus' | 'capture' | 'orphans_cleared', at: string, detail = {}) => ({ id: `${kind}${at}`, kind, at, detail, deleted_at: null })
  it('most captures in one day, Capture types tried, and times the Orphans list was emptied', () => {
    const v = values({
      activity: [
        ...['task', 'vault', 'quest', 'habit', 'postit', 'later'].map((type, i) => act('capture', `2026-11-09T1${i}:00:00Z`, { type })),
        act('capture', '2026-11-08T15:00:00Z', { type: 'task' }),
        act('orphans_cleared', '2026-11-09T12:00:00Z'),
      ],
    })
    expect(v).toMatchObject({ brain_dump: 6, tried_everything: 6, orphan_wrangler: 1 })
  })
  it('a full cycle is 4 sessions in one day; hours add up the minutes', () => {
    const v = values({ activity: [0, 1, 2, 3].map((i) => act('focus', `2026-11-09T1${i}:00:00Z`, { minutes: 25 })) })
    expect(v).toMatchObject({ full_cycle: 4, focus_days: 1, focus_hours: 1 })
  })
})

describe('SPEC §5 Trophies: perfect weeks and taking care of myself', () => {
  it('a perfect week runs Sunday to Saturday', () => {
    const logs = days('2026-11-01', 7).map((d) => done('h1', d)) // Sun Nov 1 to Sat Nov 7
    expect(values({ habits: [habit('h1', { start_date: '2026-11-01' })], habitLogs: logs }).perfect_week).toBe(1)
    expect(values({ habits: [habit('h1', { start_date: '2026-11-01' })], habitLogs: logs.slice(1) }).perfect_week).toBe(0)
  })
  it('a priority reminder done on its day counts, in a row', () => {
    const p = { id: 'p1', title: 'Meds', reminder_time: '08:00', due_date: null, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-11-01', deleted_at: null }
    const logs = days('2026-11-01', 7).map((d) => ({ id: d, task_id: 'p1', date: d, completed_at: `${d}T20:00:00Z`, deleted_at: null }))
    expect(values({ priorityTasks: [p], priorityLogs: logs }).on_it).toBe(7)
  })
})

describe('SPEC §5 Trophies: time of day and surprises', () => {
  it('early bird is 4 to 7 am, so a 2 am task never earns it', () => {
    expect(values({ tasks: [task('a', { status: 'done', completed_at: '2026-11-09T11:30:00Z' })] }).early_bird).toBe(1) // 6:30 am
    expect(values({ tasks: [task('a', { status: 'done', completed_at: '2026-11-09T07:00:00Z' })] }).early_bird).toBe(0) // 2 am
  })
  it('weekend warrior: tasks done on the Saturday and Sunday of one weekend', () => {
    const v = values({ tasks: [task('a', { status: 'done', completed_at: '2026-11-07T15:00:00Z' }), task('b', { status: 'done', completed_at: '2026-11-08T15:00:00Z' })] })
    expect(v.weekend_warrior).toBe(1)
  })
  it('Monday, handled: every task due that Monday done', () => {
    expect(values({ tasks: [task('a', { due_date: '2026-11-09', status: 'done', completed_at: '2026-11-09T15:00:00Z' })] }).monday_handled).toBe(1)
    expect(values({ tasks: [task('a', { due_date: '2026-11-09', status: 'done', completed_at: '2026-11-09T15:00:00Z' }), task('b', { due_date: '2026-11-09' })] }).monday_handled).toBe(0)
  })
  it('that was fast (within a minute) and just in time (11:50 to 11:59 pm on its due day)', () => {
    const v = values({
      tasks: [
        task('a', { status: 'done', created_at: '2026-11-09T15:00:00Z', completed_at: '2026-11-09T15:00:40Z' }),
        task('b', { due_date: '2026-11-09', status: 'done', completed_at: '2026-11-10T04:55:00Z' }), // 11:55 pm Nov 9
      ],
    })
    expect(v).toMatchObject({ that_was_fast: 1, just_in_time: 1 })
  })
  it('people and boundaries come from the server, and wait when offline', () => {
    expect(values({ connections: 5, blocks: 1 })).toMatchObject({ making_friends: 5, boundaries: 1 })
    expect(values({})).toMatchObject({ making_friends: 0, boundaries: 0 })
  })
  it('anniversaries count days since my account was made', () => {
    expect(values({ accountCreated: '2026-10-10T12:00:00Z' }).anniversary).toBe(31)
  })
})

describe('SPEC §5 Trophies: events (Adulting)', () => {
  const ev = (id: string, date: string, extra = {}) => ({ id, user_id: U, title: id, start_date: date, start_time: null, end_date: date, end_time: null, repeat: 'never' as const, reminder_minutes: null, deleted_at: null, ...extra })
  it('4 events in a finished month with none cancelled', () => {
    const events = ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23'].map((d, i) => ev(`e${i}`, d))
    expect(values({ events }).adulting).toBe(1)
    expect(values({ events: [...events, ev('x', '2026-10-30', { cancelled_at: '2026-10-29T00:00:00Z' })] }).adulting).toBe(0)
  })
})

describe('SPEC §5 Trophies: comebacks', () => {
  it('a journal entry after 2 or more days without one', () => {
    expect(journalComeback([entry('2026-11-06')], '2026-11-09')).toBe(true)
    expect(journalComeback([entry('2026-11-07')], '2026-11-09')).toBe(false)
  })
  it('finishing a task that carried over 3 or more days, or an Undated one older than 30 days', () => {
    expect(taskComeback(task('a', { due_date: '2026-11-07' }), '2026-11-10', TZ)).toBe('carried')
    expect(taskComeback(task('a', { due_date: '2026-11-08' }), '2026-11-10', TZ)).toBeNull()
    expect(taskComeback(task('a', { due_date: null, created_at: '2026-10-01T12:00:00Z' }), '2026-11-10', TZ)).toBe('old_undated')
  })
  it('reads moments in my time zone', () => {
    expect(localMoment('2026-11-10T04:55:00Z', TZ)).toEqual({ date: '2026-11-09', hour: 23, minute: 55 })
  })
})
