// SPEC §6 In-app alerts: my alerts still kept (newest first) and how many I haven't dealt with yet.
import { useRows } from '@/sync/useRows'
import { computed } from 'vue'
import { currentAlerts } from '@/notifications/rules'

export function useAlerts() {
  const all = useRows('notifications')
  const alerts = computed(() => currentAlerts(all.value, Date.now()))
  const unread = computed(() => alerts.value.filter((n) => !n.read_at).length)
  return { alerts, unread }
}
