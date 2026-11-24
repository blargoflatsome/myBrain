// SPEC §6 In-app alerts: my alerts from the last 7 days (newest first) and how many I haven't dealt with yet.
import { useRows } from '@/sync/useRows'
import { computed } from 'vue'

const KEEP_MS = 7 * 24 * 60 * 60 * 1000

export function useAlerts() {
  const all = useRows('notifications')
  const alerts = computed(() => {
    const since = new Date(Date.now() - KEEP_MS).toISOString()
    return all.value.filter((n) => n.sent_at >= since).sort((a, b) => b.sent_at.localeCompare(a.sent_at))
  })
  const unread = computed(() => alerts.value.filter((n) => !n.read_at).length)
  return { alerts, unread }
}
