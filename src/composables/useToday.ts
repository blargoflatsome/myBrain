import { onScopeDispose, ref } from 'vue'
import { deviceTimeZone, todayIn } from '@/tasks/days'

/**
 * Today's date in the device's current timezone (SPEC §5 Tasks). Re-checked every 30 seconds and whenever the
 * app comes back to the foreground, so the list rolls over at midnight and follows timezone changes.
 */
export function useToday() {
  const timeZone = ref(deviceTimeZone())
  const today = ref(todayIn(timeZone.value))

  const refresh = () => {
    timeZone.value = deviceTimeZone()
    const next = todayIn(timeZone.value)
    if (next !== today.value) today.value = next
  }
  const timer = setInterval(refresh, 30_000)
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('focus', refresh)
  onScopeDispose(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('focus', refresh)
  })
  return { today, timeZone }
}
