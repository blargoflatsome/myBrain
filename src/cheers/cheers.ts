// SPEC §5 Cheers: the server calls. They never return who wrote a post or who reacted.
import { serverCall as call, serverList as list } from '@/server/server'
import type { CheerKind, Reaction } from '@/cheers/rules'
import { achieved } from '@/celebrate/bus'
import { useBrainStore } from '@/stores/brain'

export interface CheerPost {
  id: string
  kind: CheerKind
  body: string
  created_at: string
  mine: boolean
  my_reaction: Reaction | null
  /** Counts: only on my own posts (null on everyone else's). */
  got_this: number | null
  proud: number | null
  strength: number | null
  celebrate: number | null
}

export const cheerFeed = () => list<CheerPost>('cheer_feed')
export const postCheer = (kind: CheerKind, body = '') => call<string>('post_cheer', { p_kind: kind, p_body: body })
/** True if it was saved; false if I already have one (take it back first). */
export const reactCheer = (post: string, reaction: Reaction) => call<boolean>('react_cheer', { post, p_reaction: reaction })

/** Post that I did it, or that I'm stuck; it counts toward the Cheers First (SPEC §5 Cheers). Unstuck posts don't. */
export async function shareCheer(kind: 'did_it' | 'stuck', body = '') {
  const id = await postCheer(kind, body)
  achieved({ kind: 'cheer_post' })
  return id
}

/** Cheer someone on: it counts toward the First, and my Cheers tally (on the server) toward the trophies. */
export async function cheerOn(post: string, reaction: Reaction) {
  const saved = await reactCheer(post, reaction)
  achieved({ kind: 'cheer' })
  useBrainStore().recheckTrophies()
  return saved
}
/** Take my reaction back, so I can pick again (SPEC §5 Cheers). */
export const unreactCheer = (post: string) => call<void>('unreact_cheer', { post })
/**
 * Cheer with this icon (SPEC §5 Cheers, Compact): if I'd already sent another, it's taken back first, so tapping
 * another icon switches. Switching never counts twice (the server keeps one reaction per person per post).
 */
export async function switchCheer(post: string, from: Reaction | null, to: Reaction) {
  if (from) await unreactCheer(post)
  return cheerOn(post, to)
}
/** Hide posts from this person; returns the hide's id, for Undo (null if there was nothing to hide). */
export const hideAuthor = (post: string) => call<string | null>('block_cheer_author', { post })

/** Someone I hid, known only by the post I hid them from (SPEC §5 Cheers, Hidden people). */
export interface HiddenPerson {
  id: string
  /** Null for hides made before the post was kept. */
  post_kind: CheerKind | null
  post_body: string | null
  created_at: string
}
export const hiddenPeople = () => list<HiddenPerson>('cheer_hidden')
export const showAgain = (hide: string) => call<void>('cheer_unhide', { hide })
export const stuckCount = async () => (await call<number | null>('cheer_stuck_count')) ?? 0
export const amStuck = async () => !!(await call<boolean | null>('cheer_am_stuck'))
