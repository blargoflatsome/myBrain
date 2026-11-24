// SPEC §10 Connections: the connection changes that also change my invitations or shared buckets, so my copy of
// those is brought up to date before they return (SPEC §7).
import type { ActionContext } from '@/sync/actions'

export function connectionActions({ onServer }: ActionContext) {
  return {
    /** Connect with someone going to the same event. */
    connectViaEvent: (event: string, friend: string) => onServer('connect_via_event', { event, friend }, ['event_invites']),
    /** No longer connected: their invitations and our shared buckets go too. */
    removeConnection: (friend: string, alsoBlock = false) => onServer('remove_connection', { friend, also_block: alsoBlock }, ['event_invites', 'vault_shares', 'vault_stars']),
  }
}
