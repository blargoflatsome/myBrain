<template>
  <section v-for="g in groups" :key="g.category" class="flex flex-col gap-2" :aria-labelledby="`${idPrefix}-${g.category}`" :data-testid="`${idPrefix}-${g.category}`">
    <h3 :id="`${idPrefix}-${g.category}`" class="text-sm font-semibold text-muted">{{ t.categories[g.category] }}</h3>
    <ul class="grid gap-2 sm:grid-cols-2">
      <TrophyCard v-for="item in g.items" :key="item.id" :item="item" @open="emit('open', $event)" />
    </ul>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Trophies, Profiles: trophies by category as cards, the same on my Dashboard and on a connection's profile.
import { computed } from 'vue'
import TrophyCard from '@/trophies/components/TrophyCard.vue'
import { byCategory, type BoardItem } from '@/trophies/board'
import { messages } from '@/messages'

const props = defineProps<{ items: BoardItem[]; idPrefix: string }>()
const emit = defineEmits<{ open: [BoardItem] }>()
const t = messages.celebrations.trophies
const groups = computed(() => byCategory(props.items))
</script>
