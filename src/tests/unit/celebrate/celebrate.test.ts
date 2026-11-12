import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { messages } from '@/messages'
import { newHabit } from '@/habits/rules'
import type { HabitLogRow, TaskRow } from '@/sync/types'
import {
  BADGES,
  badgeId,
  earnedFromHistory,
  effectiveLevel,
  finishedTodaysList,
  isComeback,
  isPerfectDay,
  parseSetting,
  perfectDayAlertId,
  perfectDays,
  type History,
} from '@/celebrate/rules'
import { useBrainStore } from '@/stores/brain'
import { useCelebrateStore } from '@/stores/celebrate'
import { FakeRemote } from '@/tests/support/fakeRemote'
import { achieved } from '@/celebrate/bus'

const UID = '11111111-1111-4111-8111-111111111111'
const TZ = 'UTC'
const start = new Date('2026-11-01T12:00:00Z')
const habit = (title = 'Walk') => newHabit(title, UID, TZ, start)
const done = (habitId: string, date: string): HabitLogRow => ({ id: `${habitId}-${date}`, habit_id: habitId, date, status: 'completed', deleted_at: null })
const task = (over: Partial<TaskRow>): TaskRow => ({ id: crypto.randomUUID(), title: 'Stamps', due_date: '2026-11-11', status: 'open', source: 'manual', deleted_at: null, ...over })
const emptyHistory = (): History => ({ tasks: [], habitLogs: [], routineRuns: [], journalEntries: [], vaultItems: [], questLogs: [], postIts: [], inbox: [] })

describe('Spec §5 Celebrations: the setting', () => {
  it('Full, Gentle or Off; reduce motion on the device makes Full act as Gentle', () => {
    expect(effectiveLevel('full', false)).toBe('full')
    expect(effectiveLevel('full', true)).toBe('gentle')
    expect(effectiveLevel('gentle', false)).toBe('gentle')
    expect(effectiveLevel('off', true)).toBe('off')
  })
  it('anything unknown counts as Full, the default', () => {
    expect(parseSetting(null)).toBe('full')
    expect(parseSetting('loud')).toBe('full')
    expect(parseSetting('off')).toBe('off')
  })
})

describe('Spec §5 Celebrations: badges for first times', () => {
  it('there are ten, each with the same id on every device, so it is earned once', () => {
    expect(BADGES).toHaveLength(10)
    const ids = BADGES.map((k) => badgeId(UID, k))
    expect(new Set(ids).size).toBe(10)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(badgeId(UID, 'first_task')).toBe(badgeId(UID, 'first_task'))
  })

  it('things done before celebrations existed are found in my history (awarded quietly)', () => {
    const h = emptyHistory()
    expect(earnedFromHistory(h)).toEqual([])
    h.tasks = [task({ status: 'done' })]
    h.habitLogs = [done('h1', '2026-11-02')]
    h.journalEntries = [{ id: 'j', date: '2026-11-02', body: '<p>Hello</p>', stats: {}, stats_final: true, auto: false, deleted_at: null }]
    h.questLogs = [{ id: 'q', quest_id: 'x', date: '2026-11-02', completed_at: '2026-11-02T10:00:00Z', deleted_at: null }]
    expect(earnedFromHistory(h)).toEqual(['first_task', 'first_habit', 'first_journal', 'first_quest'])
  })

  it('an entry the app wrote for me is not my first journal entry', () => {
    const h = emptyHistory()
    h.journalEntries = [{ id: 'j', date: '2026-11-02', body: '', stats: {}, stats_final: true, auto: true, deleted_at: null }]
    expect(earnedFromHistory(h)).toEqual([])
  })
})

describe('Spec §5 Celebrations: last task of the day', () => {
  it('crossing off the last open task due today finishes the list; any other is a small one', () => {
    const a = task({ status: 'done', completed_at: '2026-11-11T09:00:00Z' })
    const b = task({ status: 'open' })
    expect(finishedTodaysList([a, b], a, '2026-11-11', TZ)).toBe(false)
    const bDone = { ...b, status: 'done' as const, completed_at: '2026-11-11T10:00:00Z' }
    expect(finishedTodaysList([a, bDone], bDone, '2026-11-11', TZ)).toBe(true)
  })
  it('an undated task never counts as finishing today’s list', () => {
    const u = task({ due_date: null, status: 'done', completed_at: '2026-11-11T09:00:00Z' })
    expect(finishedTodaysList([u], u, '2026-11-11', TZ)).toBe(false)
  })
})

describe('Spec §5 Celebrations: all habits done today (a perfect day)', () => {
  const now = new Date('2026-11-05T20:00:00Z')
  it('every scheduled habit done, and at least one, makes a perfect day', () => {
    const a = habit('Walk')
    const b = habit('Read')
    expect(isPerfectDay([a, b], [done(a.id, '2026-11-05')], '2026-11-05', now, TZ)).toBe(false)
    expect(isPerfectDay([a, b], [done(a.id, '2026-11-05'), done(b.id, '2026-11-05')], '2026-11-05', now, TZ)).toBe(true)
    expect(isPerfectDay([], [], '2026-11-05', now, TZ)).toBe(false)
  })
  it('Trophies counts the perfect days', () => {
    const a = habit()
    expect(perfectDays([a], [done(a.id, '2026-11-01'), done(a.id, '2026-11-03'), done(a.id, '2026-11-04')], '2026-11-05')).toBe(3)
  })
  it('the next-day congratulations has the same id on every device, so it arrives once', () => {
    expect(perfectDayAlertId(UID, '2026-11-05')).toBe(perfectDayAlertId(UID, '2026-11-05'))
    expect(perfectDayAlertId(UID, '2026-11-05')).not.toBe(perfectDayAlertId(UID, '2026-11-06'))
  })
})

describe('Spec §5 Celebrations: comeback', () => {
  const now = new Date('2026-11-06T12:00:00Z')
  it('doing a habit after missing its previous 2 scheduled days is a comeback', () => {
    const h = habit()
    expect(isComeback(h, [done(h.id, '2026-11-03')], '2026-11-06', now, TZ)).toBe(true)
  })
  it('one missed day, or a habit too new to have missed twice, is not', () => {
    const h = habit()
    expect(isComeback(h, [done(h.id, '2026-11-04')], '2026-11-06', now, TZ)).toBe(false)
    expect(isComeback(h, [], '2026-11-02', new Date('2026-11-02T12:00:00Z'), TZ)).toBe(false)
  })
})

describe('Spec §5 Celebrations: what happens when I finish something', () => {
  let remote: FakeRemote
  beforeEach(() => {
    // A fixed midday clock in UTC: the time of day decides trophies like Early bird (4 to 7 am).
    vi.stubEnv('TZ', TZ)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T12:00:00Z') })
    setActivePinia(createPinia())
    remote = new FakeRemote()
  })
  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    const brain = useBrainStore()
    const db = brain.db
    brain.stop()
    await db?.delete()
  })
  const settle = () => new Promise((r) => setTimeout(r, 50))

  it('crossing off my first task earns its badge, with a message; the second time earns nothing new', async () => {
    const brain = useBrainStore()
    brain.start(UID, remote)
    const celebrate = useCelebrateStore()
    celebrate.start()
    const t = task({ due_date: null })
    await brain.saveTask(t)
    await brain.saveTask({ ...t, status: 'done', completed_at: new Date().toISOString() })
    await vi.waitFor(() => expect(celebrate.message?.text).toBe(messages.celebrations.badgeEarned(messages.celebrations.badges.first_task)))
    const badges = await brain.db!.badges.toArray()
    expect(badges.map((b) => b.kind)).toEqual(['first_task'])

    await brain.saveTask({ ...t, title: 'Edited while done', status: 'done' })
    achieved({ kind: 'task', task: t })
    await settle()
    expect(await brain.db!.badges.count()).toBe(1)
  })

  it('Off still gives messages and badges, but no confetti', async () => {
    const brain = useBrainStore()
    brain.start(UID, remote)
    await vi.waitFor(() => expect(brain.badgesReady).toBe(true))
    const celebrate = useCelebrateStore()
    celebrate.setSetting('off')
    celebrate.start()
    achieved({ kind: 'quest' })
    await vi.waitFor(async () => expect((await brain.db!.badges.toArray()).map((b) => b.kind)).toEqual(['first_quest']))
    expect(celebrate.bursts).toEqual([])
    expect(celebrate.message?.text).toBe(messages.celebrations.badgeEarned(messages.celebrations.badges.first_quest))
  })

  it('yesterday’s perfect day brings one congratulations alert, and earlier history badges come quietly', async () => {
    const brain = useBrainStore()
    brain.start(UID, remote)
    // Badges are only kept once this device has my badges from the server (the first download).
    await vi.waitFor(() => expect(brain.badgesReady).toBe(true))
    const h = { ...habit(), user_id: UID }
    await brain.db!.habits.put(h)
    await brain.db!.habit_logs.put({ ...done(h.id, '2026-11-05'), user_id: UID })
    brain.habitsReady = true
    const celebrate = useCelebrateStore()
    const now = new Date('2026-11-06T08:00:00Z')
    await celebrate.catchUp(now, TZ)
    await celebrate.catchUp(now, TZ)
    const alerts = (await brain.db!.notifications.toArray()).filter((n) => n.kind === 'perfect_day')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ title: 'Yesterday was a perfect day', url: '/habits', local_date: '2026-11-06' })
    expect((await brain.db!.badges.toArray()).map((b) => b.kind).filter((k) => k.startsWith('first_'))).toEqual(['first_habit'])
    expect(celebrate.message).toBeNull()
  })

  it('habits ticked on another device: yesterday is checked again once this session’s download finishes', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-06T08:00:00Z') })
    try {
      const brain = useBrainStore()
      brain.start(UID, remote)
      await settle()
      const h = { ...habit(), user_id: UID }
      await brain.db!.habits.put(h)
      const celebrate = useCelebrateStore()
      celebrate.start()
      brain.habitsReady = true
      await settle()
      const perfect = async () => (await brain.db!.notifications.toArray()).filter((n) => n.kind === 'perfect_day')
      expect(await perfect()).toHaveLength(0)
      await brain.db!.habit_logs.put({ ...done(h.id, '2026-11-05'), user_id: UID })
      brain.syncedCount++
      await settle()
      expect(await perfect()).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SPEC §5 Trophies: earning levels', () => {
  let remote: FakeRemote
  beforeEach(() => {
    // A fixed midday clock in UTC: the time of day decides trophies like Early bird (4 to 7 am).
    vi.stubEnv('TZ', TZ)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T12:00:00Z') })
    setActivePinia(createPinia())
    remote = new FakeRemote()
    localStorage.clear()
  })
  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    const brain = useBrainStore()
    const db = brain.db
    brain.stop()
    await db?.delete()
  })
  const settle = () => new Promise((r) => setTimeout(r, 50))
  const doneTasks = (n: number) => Array.from({ length: n }, (_, i) => task({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, status: 'done', completed_at: '2026-11-05T15:00:00Z', user_id: UID }))
  async function ready() {
    const brain = useBrainStore()
    brain.start(UID, remote)
    await settle()
    brain.habitsReady = true
    brain.badgesReady = true
    return brain
  }

  it('the first time on a device, trophies from the past go in quietly with one alert', async () => {
    const brain = await ready()
    await brain.db!.tasks.bulkPut(doneTasks(10))
    const celebrate = useCelebrateStore()
    await celebrate.checkTrophies(new Date('2026-11-06T12:00:00Z'), TZ)
    const row = (await brain.db!.badges.toArray()).find((b) => b.kind === 'tasks_completed')
    expect(row?.levels).toHaveLength(1)
    expect(celebrate.message).toBeNull()
    const alerts = (await brain.db!.notifications.toArray()).filter((n) => n.kind === 'trophies')
    expect(alerts).toHaveLength(1)
    const earned = (await brain.db!.badges.toArray()).filter((b) => b.levels?.length).length
    expect(alerts[0]!.title).toBe(messages.celebrations.trophies.fromPast.title(earned))
  })

  it('after that, each new level is celebrated, and a level is never saved twice', async () => {
    const brain = await ready()
    await brain.db!.tasks.bulkPut(doneTasks(10))
    const celebrate = useCelebrateStore()
    await celebrate.checkTrophies(new Date('2026-11-06T12:00:00Z'), TZ)
    await brain.db!.tasks.bulkPut(doneTasks(50))
    await celebrate.checkTrophies(new Date('2026-11-06T12:00:00Z'), TZ)
    const silver = (id: string) => messages.celebrations.trophies.earned(messages.celebrations.trophies.names[id]!, messages.celebrations.trophies.tiers.silver!)
    expect([silver('tasks_created'), silver('tasks_completed')]).toContain(celebrate.message?.text)
    await celebrate.checkTrophies(new Date('2026-11-06T12:00:00Z'), TZ)
    const row = (await brain.db!.badges.toArray()).find((b) => b.kind === 'tasks_completed')
    expect(row?.levels).toHaveLength(2)
  })

  it('finishing a task that carried over 3 or more days says so (a comeback, not a trophy)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T12:00:00Z') })
    try {
      const brain = useBrainStore()
      brain.start(UID, remote)
      const celebrate = useCelebrateStore()
      celebrate.start()
      achieved({ kind: 'task', task: task({ due_date: '2026-11-06', status: 'done' }) })
      await settle()
      expect(celebrate.message?.text).toBe(messages.celebrations.comebacks.carried)
    } finally {
      vi.useRealTimers()
    }
  })
})
