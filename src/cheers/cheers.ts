// SPEC §5 Cheers: the server calls. They never return who wrote a post or who reacted.
import { supabase } from '@/lib/supabase'
import type { CheerKind, Reaction } from '@/cheers/rules'

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

/** Why a call failed, for the message shown. */
export type CheerError = 'limit' | 'failed'

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw Object.assign(new Error(error.message), { reason: (error.code === 'P0429' ? 'limit' : 'failed') as CheerError })
  return data as T
}

export const cheerFeed = async () => (await call<CheerPost[] | null>('cheer_feed')) ?? []
export const postCheer = (kind: CheerKind, body = '') => call<string>('post_cheer', { p_kind: kind, p_body: body })
/** True if it was saved; false if I already have one (take it back first). */
export const reactCheer = (post: string, reaction: Reaction) => call<boolean>('react_cheer', { post, p_reaction: reaction })
/** Take my reaction back, so I can pick again (SPEC §5 Cheers). */
export const unreactCheer = (post: string) => call<void>('unreact_cheer', { post })
export const hideAuthor = (post: string) => call<void>('block_cheer_author', { post })
export const stuckCount = async () => (await call<number | null>('cheer_stuck_count')) ?? 0
export const amStuck = async () => !!(await call<boolean | null>('cheer_am_stuck'))
export const reasonOf = (err: unknown): CheerError => ((err as { reason?: CheerError })?.reason === 'limit' ? 'limit' : 'failed')
