// SPEC §6 In-app alerts: which alerts are still kept. Alerts last 7 days; Cheers' offers to share last a day, since by
// then the moment has passed (SPEC §5 Cheers).
import { CHEERS_OFFER_ALERT, CHEERS_UNSTUCK_ALERT } from '@/cheers/rules'
import type { NotificationRow } from '@/sync/types'

const DAY_MS = 24 * 60 * 60 * 1000
const keptFor = (kind: string) => (kind === CHEERS_OFFER_ALERT || kind === CHEERS_UNSTUCK_ALERT ? DAY_MS : 7 * DAY_MS)

/** The alerts still kept at `now`, newest first. */
export function currentAlerts(rows: readonly NotificationRow[], now: number): NotificationRow[] {
  return rows
    .filter((n) => n.sent_at >= new Date(now - keptFor(n.kind)).toISOString())
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
}
