// SPEC §5 Profiles: a connection's profile comes from one server function that checks we're connected.
import { serverList } from '@/server/server'
import type { ProfileBadge } from '@/profiles/rules'

export interface PersonProfile {
  display_name: string
  avatar_url: string | null
  badges: ProfileBadge[]
  /** My events they're already invited to. */
  invited_events: string[]
}

/** A Vault bucket shown on a profile, read-only (SPEC §5 The Vault, Shared Vaults). */
export interface ProfileBucket {
  id: string
  name: string
  checkable: boolean
  items: { id: string; title: string; notes: string | null; rating: number | null; link: string | null; checked: boolean }[]
}

/** The buckets they chose to show, A to Z; empty when we aren't connected. */
export async function connectionVault(friend: string): Promise<ProfileBucket[]> {
  return (await serverList<ProfileBucket>('connection_vault', { friend })).map((b) => ({ ...b, items: b.items ?? [] }))
}

/** Their profile, or null when we aren't connected (or either blocked the other). */
export async function connectionProfile(friend: string): Promise<PersonProfile | null> {
  const row = (await serverList<PersonProfile>('connection_profile', { friend }))[0]
  return row ? { ...row, badges: row.badges ?? [], invited_events: row.invited_events ?? [] } : null
}
