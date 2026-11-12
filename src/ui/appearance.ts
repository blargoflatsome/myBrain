// SPEC §3 Visual style, Appearance: System (follow the device), Light or Dark. Saved to my profile and remembered on
// this device, so the next visit starts in the right colours before sign-in finishes.
import { computed, ref } from 'vue'
import { readKey, writeKey } from '@/ui/storage'

export type Appearance = 'system' | 'light' | 'dark'
export const APPEARANCES: Appearance[] = ['system', 'light', 'dark']

// Starts with my-brain, so Sign out forgets it like everything else on the device (SPEC §8).
const KEY = 'my-brain:appearance'

/** A stored value as an Appearance; anything unknown is System. */
export function parseAppearance(value: unknown): Appearance {
  return value === 'light' || value === 'dark' ? value : 'system'
}

const chosen = ref<Appearance>(parseAppearance(readKey(KEY)))
const systemDark = ref(false)

/** Apply an appearance to the page (data-theme on <html>) and remember it on this device. */
export function setAppearance(value: Appearance): void {
  chosen.value = value
  if (typeof document !== 'undefined') {
    if (value === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = value
  }
  writeKey(KEY, value === 'system' ? null : value)
}

/** Run once when the app starts: the saved appearance, and following the device's setting for System. */
export function startAppearance(): void {
  setAppearance(chosen.value)
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined
  if (!query) return
  systemDark.value = query.matches
  query.addEventListener?.('change', (e) => (systemDark.value = e.matches))
}

export const appearance = computed(() => chosen.value)
/** Whether the page is showing dark colours right now. */
export const isDark = computed(() => (chosen.value === 'system' ? systemDark.value : chosen.value === 'dark'))
