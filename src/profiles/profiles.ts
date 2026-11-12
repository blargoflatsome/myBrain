// SPEC §5 Profiles: a connection's profile comes from one server function that checks we're connected.
import { supabase } from '@/lib/supabase'
import type { ProfileBadge } from '@/profiles/rules'

export interface PersonProfile {
  display_name: string
  avatar_url: string | null
  badges: ProfileBadge[]
  /** My events they're already invited to. */
  invited_events: string[]
}

/** Their profile, or null when we aren't connected (or either blocked the other). */
export async function connectionProfile(friend: string): Promise<PersonProfile | null> {
  const { data, error } = await supabase.rpc('connection_profile', { friend })
  if (error) throw new Error(error.message)
  const row = (data as PersonProfile[] | null)?.[0]
  return row ? { ...row, badges: row.badges ?? [], invited_events: row.invited_events ?? [] } : null
}
