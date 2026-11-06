// Random Quest (SPEC §5): random pick, skipping the last 3 picked, filtered by time and energy available.
import type { EnergyLevel, QuestRow, TimeBucket } from '@/sync/types'

export const ENERGY_LEVELS: EnergyLevel[] = ['ugh', 'fun', 'needs_setup', 'medicated'] // least to most
export const TIME_BUCKETS: TimeBucket[] = ['30m', '2h', 'half_day', 'full_day'] // shortest to longest
export const RECENT_PICKS = 3

export interface QuestFilter {
  /** How much energy I have; quests needing this much or less match. */
  energy?: EnergyLevel | null
  /** How much time I have; quests that fit in this or less match. */
  time?: TimeBucket | null
}

const rank = <T>(list: T[], value: T) => list.indexOf(value)

/** Open quests that fit the filter. Untagged quests match any filter. */
export function matchingQuests(quests: QuestRow[], filter: QuestFilter = {}): QuestRow[] {
  return quests.filter((q) => {
    if (q.deleted_at || q.status !== 'open') return false
    if (filter.energy && q.energy_level && rank(ENERGY_LEVELS, q.energy_level) > rank(ENERGY_LEVELS, filter.energy)) return false
    if (filter.time && q.time_bucket && rank(TIME_BUCKETS, q.time_bucket) > rank(TIME_BUCKETS, filter.time)) return false
    return true
  })
}

/** Ids of the last few quests picked, most recent first. */
export function recentlyPicked(quests: QuestRow[], count = RECENT_PICKS): Set<string> {
  return new Set(
    quests
      .filter((q) => q.last_picked_at)
      .sort((a, b) => b.last_picked_at!.localeCompare(a.last_picked_at!))
      .slice(0, count)
      .map((q) => q.id),
  )
}

/**
 * Pick a quest at random from the matches, skipping the recently picked ones. If every match is recent,
 * offer the least recently picked match rather than nothing. Returns null when nothing matches at all.
 */
export function pickQuest(quests: QuestRow[], filter: QuestFilter = {}, random: () => number = Math.random): QuestRow | null {
  const matches = matchingQuests(quests, filter)
  if (!matches.length) return null
  const recent = recentlyPicked(quests)
  const fresh = matches.filter((q) => !recent.has(q.id))
  if (fresh.length) return fresh[Math.floor(random() * fresh.length)]!
  return [...matches].sort((a, b) => (a.last_picked_at ?? '').localeCompare(b.last_picked_at ?? ''))[0]!
}

/** Record that a quest was offered. */
export function markPicked(quest: QuestRow, now: Date = new Date()): QuestRow {
  return { ...quest, last_picked_at: now.toISOString(), times_picked: (quest.times_picked ?? 0) + 1 }
}

export const acceptQuest = (q: QuestRow): QuestRow => ({ ...q, status: 'accepted' })
export const finishQuest = (q: QuestRow): QuestRow => ({ ...q, status: 'done' })
