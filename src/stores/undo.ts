// SPEC §2 Confirm before impact; undo for the rest: removing one thing, or clearing a list, happens straight away
// with an Undo bar for 8 seconds. The newest action replaces the one before. The timer pauses while the mouse or
// keyboard is on the bar, so nobody is rushed (WCAG 2.2.1).
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const UNDO_MS = 8000

export interface UndoOffer {
  id: number
  message: string
  undo: () => Promise<unknown> | unknown
  /** The button's word: Undo, or another action the bar offers (Cheers' Share, SPEC §5 Cheers). */
  label?: string
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
  function offer(message: string, undo: UndoOffer['undo'], label?: string) {
    current.value = { id: ++next, message, undo, label }
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
