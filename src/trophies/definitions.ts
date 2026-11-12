// SPEC §5 Trophies: every trophy as data (id, category, levels), so new ones can be added without restructuring.
// Ids are stored and their position in TROPHIES makes the row id, so only ever add to the end of the list.

export const CATEGORIES = [
  'firsts',
  'streaks',
  'totals',
  'brain_dumps',
  'focus',
  'perfect',
  'quests',
  'care',
  'reflection',
  'time_of_day',
  'organized',
  'events',
  'people',
  'surprises',
  'anniversaries',
] as const
export type TrophyCategory = (typeof CATEGORIES)[number]

/** Bronze to Legendary: a trophy's level is how many of its thresholds I've reached. */
export const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary'] as const

/** How progress reads: "7 of 14 days", "38 of 50", "3 of 10 hours", "x of 4". */
export type TrophyUnit = 'days' | 'count' | 'hours' | 'words' | 'times'

export interface Trophy {
  id: string
  category: TrophyCategory
  /** The value each level needs, lowest first. One threshold = earned or not. */
  levels: readonly number[]
  unit: TrophyUnit
  /** Shown as "???" until earned. */
  hidden?: boolean
}

export const STREAK_LEVELS = [3, 7, 30, 60, 182, 365] as const
export const TOTAL_LEVELS = [10, 50, 100, 250, 500, 1000] as const

const t = (id: string, category: TrophyCategory, levels: readonly number[], unit: TrophyUnit = 'count', hidden = false): Trophy => ({ id, category, levels, unit, hidden })

/** Computed trophies, in the order they're listed. Append only (see above). */
export const TROPHIES: readonly Trophy[] = [
  t('habit_streak', 'streaks', STREAK_LEVELS, 'days'),
  t('journal_streak', 'streaks', STREAK_LEVELS, 'days'),
  t('routine_streak', 'streaks', STREAK_LEVELS, 'days'),
  t('perfect_streak', 'streaks', STREAK_LEVELS, 'days'),
  t('good_days', 'streaks', STREAK_LEVELS, 'days'),
  t('tasks_created', 'totals', TOTAL_LEVELS),
  t('tasks_completed', 'totals', TOTAL_LEVELS),
  t('habits_created', 'totals', TOTAL_LEVELS),
  t('habit_checkins', 'totals', TOTAL_LEVELS),
  t('journal_entries', 'totals', TOTAL_LEVELS),
  t('routines_finished', 'totals', TOTAL_LEVELS),
  t('quests_finished', 'totals', TOTAL_LEVELS),
  t('vault_items', 'totals', TOTAL_LEVELS),
  t('brain_dump', 'brain_dumps', [10]),
  t('orphan_wrangler', 'brain_dumps', [5, 25], 'times'),
  t('tried_everything', 'brain_dumps', [6]),
  t('full_cycle', 'focus', [4]),
  t('focus_days', 'focus', [5, 20, 50], 'days'),
  t('focus_hours', 'focus', [10, 50, 100], 'hours'),
  t('perfect_days', 'perfect', [1, 10, 50], 'days'),
  t('perfect_week', 'perfect', [1]),
  t('perfect_month', 'perfect', [1]),
  t('perfect_year', 'perfect', [1]),
  t('every_energy', 'quests', [4]),
  t('quest_month', 'quests', [10]),
  t('on_it', 'care', [7, 30, 100], 'times'),
  t('care_month', 'care', [1]),
  t('words_written', 'reflection', [1000, 10000], 'words'),
  t('early_bird', 'time_of_day', [1]),
  t('weekend_warrior', 'time_of_day', [1]),
  t('monday_handled', 'time_of_day', [1]),
  t('organized', 'organized', [5]),
  t('adulting', 'events', [1]),
  t('making_friends', 'people', [5]),
  t('social_butterfly', 'people', [10]),
  t('that_was_fast', 'surprises', [1], 'count', true),
  t('just_in_time', 'surprises', [1], 'count', true),
  t('boundaries', 'surprises', [1], 'count', true),
  t('healthy_brain', 'surprises', [1], 'count', true),
  t('anniversary', 'anniversaries', [7, 30, 182, 365], 'days'),
]

export type TrophyId = string

/** The trophies' row ids start after the first-time badges' (SPEC §7: the same id on every device). */
export function trophyRowId(userId: string, id: TrophyId): string {
  const n = 0x100 + TROPHIES.findIndex((tr) => tr.id === id)
  return `${userId.slice(0, 24)}${n.toString(16).padStart(12, '0')}`
}

/** How many thresholds a value has reached: 0 = not started. */
export function levelFor(trophy: Trophy, value: number): number {
  return trophy.levels.filter((need) => value >= need).length
}
