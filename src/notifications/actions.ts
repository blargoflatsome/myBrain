// The app's own alerts (SPEC §6 In-app alerts).
import type { ActionContext } from '@/sync/actions'
import { live } from '@/sync/live'

export function alertActions({ ready }: ActionContext) {
  async function clearNotification(id: string) {
    await ready().engine.remove('notifications', id)
  }

  /** Clear all alerts still showing. */
  async function clearNotifications() {
    const { engine: e, local } = ready()
    await e.removeMany('notifications', live(await local.notifications.toArray()).map((n) => n.id))
  }

  /** Tapping an alert counts it as seen, on every device. */
  async function markNotificationRead(id: string) {
    await ready().engine.patch('notifications', id, (n) => (n.read_at ? {} : { read_at: new Date().toISOString() }))
  }

  return { clearNotification, clearNotifications, markNotificationRead }
}
