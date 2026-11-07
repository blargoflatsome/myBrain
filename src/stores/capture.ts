// The Capture window (SPEC §5 Quick capture): opens over whatever page I'm on, so capturing never takes me away.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface CapturePreset {
  due: string | null
  source: 'journal'
}

export const useCaptureStore = defineStore('capture', () => {
  const isOpen = ref(false)
  const preset = ref<CapturePreset | undefined>(undefined)
  /** Changes on every open, so each opening starts with a fresh form. */
  const opened = ref(0)

  function open(withPreset?: CapturePreset) {
    preset.value = withPreset
    opened.value++
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  return { isOpen, preset, opened, open, close }
})
