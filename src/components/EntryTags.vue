<script setup lang="ts">
// Tags on one item, saved as soon as they change (used for journal entries, which save as I type).
import { toRef } from 'vue'
import TagInput from '@/components/TagInput.vue'
import { useItemTags } from '@/composables/useItemTags'
import type { TaggedType } from '@/sync/types'

const props = defineProps<{ type: TaggedType; itemId: string }>()
const tags = useItemTags(props.type, toRef(props, 'itemId'))

async function update(names: string[]) {
  tags.names.value = names
  await tags.save(props.itemId)
}
</script>

<template>
  <TagInput :model-value="tags.names.value" @update:model-value="update" />
</template>
