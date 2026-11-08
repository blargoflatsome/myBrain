// The Capture window (SPEC §5 Quick capture): opens over whatever page I'm on, so capturing never takes me away.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useCaptureStore = defineStore('capture', () => {
  const isOpen = ref(false)
  /** Changes on every open, so each opening starts with a fresh form. */
  const opened = ref(0)

  function open() {
    opened.value++
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  return { isOpen, opened, open, close }
})
