// Keep the screen awake while a full-screen timer is showing (SPEC §5 Focus timer, Breathe). Browsers without the
// Screen Wake Lock API, or that refuse it (low battery), just let the screen sleep as usual.
import { onScopeDispose, watch } from 'vue'

type Lock = { release(): Promise<void> }

export function useWakeLock(active: () => boolean) {
  let lock: Lock | null = null
  const release = async () => {
    await lock?.release().catch(() => {})
    lock = null
  }
  watch(
    active,
    async (on) => {
      if (!on) return release()
      try {
        lock = (await (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Lock> } }).wakeLock?.request('screen')) ?? null
      } catch {
        lock = null
      }
    },
    { immediate: true },
  )
  onScopeDispose(() => void release())
}
