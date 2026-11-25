// SPEC §5 Cheers: the rules that don't need the server: reactions, "2 h ago", suggested lines and when to offer.
import { messages } from '@/messages'
import type { IconName } from '@/ui/icons'

export type CheerKind = 'did_it' | 'stuck' | 'unstuck'
export const REACTIONS = ['got_this', 'proud', 'strength', 'celebrate'] as const
export type Reaction = (typeof REACTIONS)[number]
export const REACTION_ICONS: Record<Reaction, IconName> = { got_this: 'thumbsUp', proud: 'star', strength: 'heart', celebrate: 'sparkles' }

/** Matches the database's limit on I did it! posts. */
export const MAX_CHARS = 140
/** The feed only shows the last 48 hours. */
export const FEED_HOURS = 48
/** An I did it! offer comes at most this often, so it never nags (SPEC §5 Cheers). */
export const OFFER_GAP_MS = 2 * 60 * 60 * 1000
/** The alerts that offer to share: kept a day, not the usual 7 (src/notifications/useAlerts.ts). */
export const CHEERS_OFFER_ALERT = 'cheers_offer'
export const CHEERS_UNSTUCK_ALERT = 'cheers_unstuck'

const m = messages.cheers

/** "Just now", "12 min ago", "2 h ago". */
export function agoLabel(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return m.ago.now
  if (minutes < 60) return m.ago.minutes(minutes)
  return m.ago.hours(Math.floor(minutes / 60))
}

/** One item from a list, at random (random() is passed in so tests can choose). */
export function pickOne<T>(list: readonly T[], random: () => number = Math.random): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!
}

/** What a post says: my own words for I did it!, a fixed line otherwise. */
export function postText(kind: CheerKind, body: string): string {
  if (kind === 'stuck') return m.stuck
  if (kind === 'unstuck') return m.unstuck
  return body
}

/** Something I just finished, as Cheers sees it (no titles: they're private). */
export type Moment =
  | { kind: 'old_task'; days: number }
  | { kind: 'routine' }
  | { kind: 'quest'; ugh: boolean }
  | { kind: 'trophy'; name: string }
  /** A habit or task done that isn't worth an I did it! on its own, but does count for getting unstuck. */
  | { kind: 'small' }

/** The suggested I did it! line for a moment, or null when it isn't one to offer. */
export function suggestion(moment: Moment): string | null {
  switch (moment.kind) {
    case 'old_task':
      return m.suggest.oldTask(moment.days)
    case 'routine':
      return m.suggest.routine
    case 'quest':
      return moment.ugh ? m.suggest.ughQuest : m.suggest.quest
    case 'trophy':
      return m.suggest.trophy(moment.name)
    case 'small':
      return null
  }
}

export type Offer = { kind: 'unstuck' } | { kind: 'did_it'; line: string }

/**
 * What to offer after a moment: I got unstuck! if I posted I'm stuck today (any finished thing counts), otherwise an
 * I did it! line, but not within OFFER_GAP_MS of the last offer.
 */
export function offerFor(moment: Moment, stuckToday: boolean, lastOfferAt: number, now: number): Offer | null {
  if (stuckToday) return { kind: 'unstuck' }
  const line = suggestion(moment)
  if (!line || now - lastOfferAt < OFFER_GAP_MS) return null
  return { kind: 'did_it', line }
}
