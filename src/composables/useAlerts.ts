// SPEC §6 In-app alerts: my alerts from the last 7 days (newest first) and how many I haven't dealt with yet.
import { computed } from 'vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useBrainStore } from '@/stores/brain'
import { live } from '@/sync/live'
import type { NotificationRow } from '@/sync/types'

const KEEP_MS = 7 * 24 * 60 * 60 * 1000

export function useAlerts() {
  const brain = useBrainStore()
  const all = useLiveQuery<NotificationRow[]>(async () => (brain.db ? live(await brain.db.notifications.toArray()) : []), [], [() => brain.db])
  const alerts = computed(() => {
    const since = new Date(Date.now() - KEEP_MS).toISOString()
    return all.value.filter((n) => n.sent_at >= since).sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  })
  const unread = computed(() => alerts.value.filter((n) => !n.read_at).length)
  return { alerts, unread }
}
