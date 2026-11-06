import { onScopeDispose, ref } from 'vue'

/** True on tablet width and up (Tailwind's md breakpoint), where the left menu is always shown. */
export function useWideScreen() {
  const query = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null
  const wide = ref(query?.matches ?? false)
  const update = (e: MediaQueryListEvent) => (wide.value = e.matches)
  query?.addEventListener('change', update)
  onScopeDispose(() => query?.removeEventListener('change', update))
  return wide
}
