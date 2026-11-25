import { readRows } from '@/sync/useRows'
import { ref, watch, type Ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { tagsOf } from '@/tags/rules'
import type { TaggedType } from '@/sync/types'

/**
 * The tag names on an item, loaded when the item changes, for an editor's tag field (SPEC §5 Global search and tags).
 * The editor hands them to the item's add or save, which saves them after the item.
 */
export function useItemTags(type: TaggedType, itemId: Ref<string | null | undefined>) {
  const brain = useBrainStore()
  const names = ref<string[]>([])
  watch(
    [itemId, () => brain.userId],
    async ([id]) => {
      names.value = []
      if (!id) return
      const links = await readRows((db) => db.item_tags.where('item_id').equals(id).toArray())
      names.value = tagsOf(links, await readRows('tags'), type, id).map((t) => t.name)
    },
    { immediate: true },
  )
  return { names }
}
