import { onScopeDispose } from 'vue'

/**
 * Run `fn` when the page is hidden: switching apps, locking the phone or closing the tab (SPEC §7). Phones may stop
 * or kill a hidden app without warning, so anything waiting (a save on a timer) must be stored now.
 */
export function onPageHide(fn: () => void) {
  if (typeof document === 'undefined') return
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') fn()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', fn)
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', fn)
  })
}
