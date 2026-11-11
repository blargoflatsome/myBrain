// The Search window (SPEC §5 Global search and tags): opens over whatever page I'm on, optionally already
// filtered to one tag (from the Tags page).
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSearchStore = defineStore('search', () => {
  const isOpen = ref(false)
  /** A tag to filter by when the window opens; read once by the window. */
  const startTag = ref<string | null>(null)
  function open(tagId: string | null = null) {
    startTag.value = tagId
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  return { isOpen, startTag, open, close }
})
