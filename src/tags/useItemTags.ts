import { ref, watch, type Ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { tagsOf } from '@/tags/rules'
import type { TaggedType } from '@/sync/types'

/**
 * The tag names on an item, loaded when the item changes (for an editor's tag field), and a save that writes the
 * names back (SPEC §5 Global search and tags).
 */
export function useItemTags(type: TaggedType, itemId: Ref<string | null | undefined>) {
  const brain = useBrainStore()
  const names = ref<string[]>([])
  watch(
    [itemId, () => brain.db],
    async ([id]) => {
      names.value = []
      if (!id || !brain.db) return
      const links = await brain.db.item_tags.where('item_id').equals(id).toArray()
      names.value = tagsOf(links, await brain.db.tags.toArray(), type, id).map((t) => t.name)
    },
    { immediate: true },
  )
  async function save(id: string) {
    await brain.saveTags(type, id, names.value)
  }
  return { names, save }
}
