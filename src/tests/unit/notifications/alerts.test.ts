import { describe, expect, it } from 'vitest'
import { currentAlerts } from '@/notifications/rules'
import { CHEERS_OFFER_ALERT, CHEERS_UNSTUCK_ALERT } from '@/cheers/rules'
import type { NotificationRow } from '@/sync/types'

const NOW = new Date('2026-11-24T12:00:00Z').getTime()
const HOUR = 60 * 60 * 1000
const alert = (id: string, kind: string, hoursAgo: number): NotificationRow => ({
  id, user_id: 'u1', kind, item_id: null, title: id, body: '', url: '/', local_date: '2026-11-24', sent_at: new Date(NOW - hoursAgo * HOUR).toISOString(), deleted_at: null,
})

describe('SPEC §6 In-app alerts: kept 7 days; SPEC §5 Cheers: an offer to share is kept a day', () => {
  it('a reminder lasts the week; offers to share are gone after a day', () => {
    const rows = [
      alert('reminder-6-days', 'habit', 6 * 24),
      alert('reminder-8-days', 'habit', 8 * 24),
      alert('offer-23-hours', CHEERS_OFFER_ALERT, 23),
      alert('offer-25-hours', CHEERS_OFFER_ALERT, 25),
      alert('unstuck-25-hours', CHEERS_UNSTUCK_ALERT, 25),
    ]
    expect(currentAlerts(rows, NOW).map((n) => n.id)).toEqual(['offer-23-hours', 'reminder-6-days'])
  })
})
