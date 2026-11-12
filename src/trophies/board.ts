// SPEC §5 Trophies: what the Trophies section shows: each trophy's level, progress and when it was earned,
// grouped by category; locked ones apart, surprises hidden until earned.
import type { BadgeRow } from '@/sync/types'
import { BADGES } from '@/celebrate/rules'
import { CATEGORIES, levelFor, TIERS, TROPHIES, type TrophyCategory, type TrophyUnit } from '@/trophies/definitions'
import { todayIn } from '@/tasks/days'
import { live } from '@/sync/live'
import { messages } from '@/messages'

export interface BoardItem {
  id: string
  category: TrophyCategory
  /** Levels reached (0 = not yet) and how many there are. */
  level: number
  levels: number
  /** What each level needs (empty for first-time badges). */
  thresholds: readonly number[]
  tier: (typeof TIERS)[number] | null
  /** When the latest level was earned (ISO) and its day in my time zone. */
  lastAt: string | null
  lastDay: string | null
  /** The days each level was earned, in my time zone. */
  days: string[]
  /** Progress to the next level, when it can be counted. */
  value: number | null
  next: number | null
  unit: TrophyUnit
  hidden: boolean
  /** Not started: shown greyed out in the locked window. */
  locked: boolean
}

/** Every trophy as the board shows it. `values` is null until my history has been worked out. */
export function trophyBoard(badges: BadgeRow[], values: Record<string, number> | null, timeZone: string): BoardItem[] {
  const rows = new Map(live(badges).map((b) => [b.kind, b]))
  const day = (iso: string) => todayIn(timeZone, new Date(iso))
  const firsts: BoardItem[] = BADGES.map((kind) => {
    const b = rows.get(kind)
    return {
      id: kind, category: 'firsts', level: b ? 1 : 0, levels: 1, thresholds: [], tier: null, lastAt: b?.earned_at ?? null, lastDay: b ? day(b.earned_at) : null,
      days: b ? [day(b.earned_at)] : [], value: null, next: null, unit: 'count', hidden: false, locked: !b,
    }
  })
  const computed: BoardItem[] = TROPHIES.map((trophy) => {
    const saved = rows.get(trophy.id)?.levels ?? []
    const value = values ? (values[trophy.id] ?? 0) : null
    const level = Math.max(saved.length, value === null ? 0 : levelFor(trophy, value))
    const lastAt = saved.at(-1) ?? null
    return {
      id: trophy.id,
      category: trophy.category,
      level,
      levels: trophy.levels.length,
      thresholds: trophy.levels,
      tier: level && trophy.levels.length > 1 ? TIERS[level - 1]! : null,
      lastAt,
      lastDay: lastAt ? day(lastAt) : null,
      days: saved.map(day),
      value,
      next: trophy.levels[level] ?? null,
      unit: trophy.unit,
      hidden: !!trophy.hidden && !level,
      locked: !level && !value,
    }
  })
  return [...firsts, ...computed]
}

/** Items grouped by category, in the categories' order, leaving out empty ones. */
export function byCategory(items: BoardItem[]): { category: TrophyCategory; items: BoardItem[] }[] {
  return CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter((g) => g.items.length)
}

/** The newest earned levels first. */
export function newest(items: BoardItem[], n: number): BoardItem[] {
  return items.filter((i) => i.level && i.lastAt).sort((a, b) => b.lastAt!.localeCompare(a.lastAt!)).slice(0, n)
}

/** Trophies that went up on a day (for "How past you did yesterday"). */
export function earnedOn(items: BoardItem[], date: string): BoardItem[] {
  return items.filter((i) => i.days.includes(date))
}

/** A trophy's name as shown: ??? for a surprise not found yet. */
export function trophyName(item: BoardItem): string {
  const cm = messages.celebrations
  if (item.hidden) return cm.trophies.hidden
  return item.category === 'firsts' ? cm.badges[item.id as keyof typeof cm.badges] : (cm.trophies.names[item.id] ?? item.id)
}
