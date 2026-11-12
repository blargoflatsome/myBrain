import { onScopeDispose, ref } from 'vue'

/**
 * The current moment, refreshed every `everyMs` and whenever the app comes back to the foreground, so a timer that
 * ran out while the phone slept shows at once (SPEC §5 Habits, Priority tasks).
 */
export function useNow(everyMs = 60_000) {
  const now = ref(new Date())
  const refresh = () => {
    if (document.visibilityState === 'visible') now.value = new Date()
  }
  const timer = setInterval(refresh, everyMs)
  document.addEventListener('visibilitychange', refresh)
  onScopeDispose(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', refresh)
  })
  return now
}
