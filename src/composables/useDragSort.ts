import { onBeforeUnmount, watch, type Ref } from 'vue'
import Sortable from 'sortablejs'

/**
 * Drag-and-drop sorting for a list (SPEC §5: anywhere I sort, I drag). Items are dragged by an element with the
 * `drag-handle` class, so tapping and scrolling still work on a phone. Vue stays in charge of the page: the dragged
 * element is put back and `onReorder(from, to)` changes the data, which redraws the list in the new order.
 */
export function useDragSort(list: Ref<HTMLElement | null>, onReorder: (from: number, to: number) => void | Promise<void>) {
  let sortable: Sortable | null = null
  watch(
    list,
    (el) => {
      sortable?.destroy()
      sortable = null
      if (!el) return
      sortable = Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        forceFallback: true,
        fallbackTolerance: 3,
        ghostClass: 'opacity-40',
        onEnd: (evt) => {
          const { oldIndex, newIndex, item, from } = evt
          if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
          from.removeChild(item)
          from.insertBefore(item, from.children[oldIndex] ?? null)
          void onReorder(oldIndex, newIndex)
        },
      })
    },
    { flush: 'post', immediate: true },
  )
  onBeforeUnmount(() => sortable?.destroy())
}

/** Which way an arrow key on a drag handle moves the item: -1 up, 1 down, 0 for other keys. */
export function arrowStep(event: KeyboardEvent): -1 | 0 | 1 {
  return event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
}
