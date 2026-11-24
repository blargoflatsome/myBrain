// SPEC §2 Confirm before impact; undo for the rest: removing one thing, or clearing a list, happens straight away
// with an Undo bar for 8 seconds. The newest action replaces the one before. The timer pauses while the mouse or
// keyboard is on the bar, so nobody is rushed (WCAG 2.2.1). Done from the keyboard, focus moves to the bar's button so
// it can be reached in time; once the bar closes, focus lands where the page says (its heading by default).
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const UNDO_MS = 8000

export interface UndoOptions {
  /** The button's word: Undo, or another action the bar offers (Cheers' Share, SPEC §5 Cheers). */
  label?: string
  /** Where keyboard focus lands once the bar closes; the page's heading when not given or it finds nothing. */
  focusAfter?: () => HTMLElement | null | Promise<HTMLElement | null>
}

export interface UndoOffer extends UndoOptions {
  id: number
  message: string
  undo: () => Promise<unknown> | unknown
  /** The action was done from the keyboard, so the bar takes focus. */
  byKeyboard: boolean
}

// Whether the last press was a key (rather than a mouse, pen or finger), the same way browsers decide :focus-visible.
let keyboardLast = false
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => (keyboardLast = !e.metaKey && !e.ctrlKey && !e.altKey), true)
  document.addEventListener('pointerdown', () => (keyboardLast = false), true)
}

export const useUndoStore = defineStore('undo', () => {
  const current = ref<UndoOffer | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let next = 0

  function start() {
    clearTimeout(timer)
    timer = setTimeout(() => (current.value = null), UNDO_MS)
  }
  /** Show "message · Undo" (or another label); tapping the button runs `undo`. */
  function offer(message: string, undo: UndoOffer['undo'], options: UndoOptions = {}) {
    current.value = { id: ++next, message, undo, byKeyboard: keyboardLast, ...options }
    start()
  }
  function pause() {
    clearTimeout(timer)
  }
  function resume() {
    if (current.value) start()
  }
  async function run() {
    const offer = current.value
    dismiss()
    await offer?.undo()
  }
  function dismiss() {
    clearTimeout(timer)
    current.value = null
  }
  return { current, offer, pause, resume, run, dismiss }
})
