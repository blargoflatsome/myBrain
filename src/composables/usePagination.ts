// SPEC §2 Long lists come in pages: any list that can grow long shows one page at a time (with PageControls.vue).
import { computed, ref, watch, type Ref } from 'vue'

export function usePagination<T>(items: Ref<T[]>, pageSize: number) {
  const page = ref(1)
  const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize)))
  // When the list shrinks (an item cleared, a filter changed), stay on a page that still exists.
  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })
  const pageItems = computed(() => items.value.slice((page.value - 1) * pageSize, page.value * pageSize))
  return { page, pageCount, pageItems }
}
