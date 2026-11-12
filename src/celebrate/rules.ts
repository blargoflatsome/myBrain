// SPEC §5 Celebrations: which celebration fits, badges for first times, perfect days and comebacks.
import { fixedId, logIdFor } from '@/sync/ids'
import type { BadgeRow, HabitLogRow, HabitRow, InboxRow, JournalEntryRow, PostItRow, QuestLogRow, RoutineRunRow, TaskRow, VaultItemRow } from '@/sync/types'
import { dayStatus, isScheduled } from '@/habits/rules'
import { tasksForDay } from '@/tasks/rules'
import { addDays } from '@/tasks/days'
import { live } from '@/sync/live'

export type CelebrationSetting = 'full' | 'gentle' | 'off'
export const CELEBRATION_SETTINGS: readonly CelebrationSetting[] = ['full', 'gentle', 'off']

/** The first-time badges, in the order Trophies lists them. */
export const BADGES = [
  'first_task',
  'first_habit',
  'first_routine',
  'first_journal',
  'first_vault',
  'first_quest',
  'first_focus',
  'first_postit',
  'first_orphan',
  'first_shared_event',
] as const
export type BadgeKind = (typeof BADGES)[number]

/** How lively celebrations are on this device: the device's reduce-motion setting turns Full into Gentle. */
export function effectiveLevel(setting: CelebrationSetting, reduceMotion: boolean): CelebrationSetting {
  return setting === 'full' && reduceMotion ? 'gentle' : setting
}

/** A saved setting, or Full for anything unknown. */
export function parseSetting(value: unknown): CelebrationSetting {
  return CELEBRATION_SETTINGS.includes(value as CelebrationSetting) ? (value as CelebrationSetting) : 'full'
}

/** The same id for a badge on every device, so two devices earning it at once write one row (SPEC §7). */
export function badgeId(userId: string, kind: BadgeKind): string {
  return `${userId.slice(0, 24)}${(BADGES.indexOf(kind) + 1).toString(16).padStart(12, '0')}`
}

/** The same id for a day's "all habits done" congratulations on every device, so it arrives once. */
export function perfectDayAlertId(userId: string, date: string): string {
  return logIdFor(userId, date, '0001')
}

/** The one alert for trophies worked out the first time on a device: the same id everywhere, so it comes once. */
export const firstTrophiesAlertId = (userId: string): string => fixedId(userId, 'ffff00000001')

/** Badges I haven't got yet. */
export function missingBadges(have: BadgeRow[], kinds: readonly BadgeKind[] = BADGES): BadgeKind[] {
  const got = new Set(live(have).map((b) => b.kind))
  return kinds.filter((k) => !got.has(k))
}

export interface History {
  tasks: TaskRow[]
  habitLogs: HabitLogRow[]
  routineRuns: RoutineRunRow[]
  journalEntries: JournalEntryRow[]
  vaultItems: VaultItemRow[]
  questLogs: QuestLogRow[]
  postIts: PostItRow[]
  inbox: InboxRow[]
}

/**
 * Badges my history already shows I earned (things done before celebrations existed, or on another device). They
 * are awarded quietly. Orphans, Focus sessions and shared events leave no history here, so they wait for the next time.
 */
export function earnedFromHistory(h: History): BadgeKind[] {
  const earned: BadgeKind[] = []
  if (h.tasks.some((t) => t.status === 'done')) earned.push('first_task')
  if (live(h.habitLogs).some((l) => l.status === 'completed')) earned.push('first_habit')
  if (live(h.routineRuns).some((r) => r.finished_at)) earned.push('first_routine')
  if (live(h.journalEntries).some((e) => !e.auto && e.body.trim())) earned.push('first_journal')
  if (h.vaultItems.length) earned.push('first_vault')
  if (h.questLogs.length) earned.push('first_quest')
  if (h.postIts.length) earned.push('first_postit')
  return earned
}

/** Crossing off this task finished today's list: every task due today is now done (SPEC §5 Celebrations). */
export function finishedTodaysList(tasks: TaskRow[], task: TaskRow, today: string, timeZone: string): boolean {
  const list = tasksForDay(tasks, today, today, timeZone)
  return list.some((t) => t.id === task.id) && list.every((t) => t.status === 'done')
}

/** Every habit scheduled on a day is done, and there was at least one: a perfect day. */
export function isPerfectDay(habits: HabitRow[], logs: HabitLogRow[], date: string, now: Date, timeZone: string): boolean {
  const scheduled = live(habits).filter((h) => isScheduled(h, date))
  return scheduled.length > 0 && scheduled.every((h) => dayStatus(h, date, logs, now, timeZone) === 'completed')
}

/** How many perfect days I've had, up to and including today. */
export function perfectDays(habits: HabitRow[], logs: HabitLogRow[], today: string): number {
  const active = live(habits)
  if (!active.length) return 0
  const completed = new Set(live(logs).filter((l) => l.status === 'completed').map((l) => `${l.habit_id}|${l.date}`))
  const first = active.map((h) => h.start_date).sort()[0]!
  let count = 0
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const scheduled = active.filter((h) => isScheduled(h, d))
    if (scheduled.length && scheduled.every((h) => completed.has(`${h.id}|${d}`))) count++
  }
  return count
}

/** How many scheduled days in a row before a comeback counts (SPEC §5 Celebrations). */
export const COMEBACK_MISSES = 2

/** Doing a habit on `date` after missing it on its previous 2 or more scheduled days: a comeback. */
export function isComeback(habit: HabitRow, logs: HabitLogRow[], date: string, now: Date, timeZone: string): boolean {
  let misses = 0
  // A year back is plenty: a weekly habit has 52 scheduled days in it, a monthly one 12.
  for (let d = addDays(date, -1), i = 0; d >= habit.start_date && i < 366 && misses < COMEBACK_MISSES; d = addDays(d, -1), i++) {
    if (!isScheduled(habit, d)) continue
    if (dayStatus(habit, d, logs, now, timeZone) !== 'missed') return false
    misses++
  }
  return misses >= COMEBACK_MISSES
}
