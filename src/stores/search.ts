// The Search window (SPEC §5 Global search and tags): opens over whatever page I'm on.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSearchStore = defineStore('search', () => {
  const isOpen = ref(false)
  function open() {
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  return { isOpen, open, close }
})
