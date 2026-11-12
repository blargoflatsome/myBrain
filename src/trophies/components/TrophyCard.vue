<template>
  <li
    class="rounded-xl border"
    :class="item.level ? 'border-line' : 'border-dashed border-line text-muted'"
    :data-testid="`trophy-${item.id}`"
    :data-level="item.level"
  >
    <component
      :is="item.level ? 'button' : 'div'"
      :type="item.level ? 'button' : undefined"
      class="flex w-full items-center gap-3 rounded-xl p-3 text-left"
      :class="item.level ? 'min-h-11 hover:bg-bg' : ''"
      @click="item.level && emit('open', item)"
    >
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-full"
        :class="item.level ? 'bg-done text-bg' : 'border border-dashed border-muted text-muted'"
        aria-hidden="true"
      ><AppIcon name="trophy" size="size-5" /></span>
      <span class="flex min-w-0 flex-col">
        <span class="font-medium break-words" data-testid="trophy-name">{{ trophyName(item) }}</span>
        <span v-if="item.tier" class="text-xs" data-testid="trophy-level">{{ t.tiers[item.tier] }}</span>
        <span v-if="progressText" class="text-xs text-muted" data-testid="trophy-progress">{{ progressText }}</span>
        <span v-else-if="!item.level" class="text-xs text-muted">{{ aboutText }}</span>
        <span v-if="item.lastDay" class="text-xs text-muted">{{ t.earnedOn(dateWithYear(item.lastDay)) }}</span>
      </span>
    </component>
  </li>
</template>

<script setup lang="ts">
// SPEC §5 Trophies: one trophy: its name (??? for a surprise not found yet), level, progress to the next level, and
// the day the latest level was earned. An earned one is a button that opens what I did to earn it.
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { trophyName, type BoardItem } from '@/trophies/board'
import { messages } from '@/messages'
import { dateWithYear } from '@/ui/dates'

const props = defineProps<{ item: BoardItem }>()
const emit = defineEmits<{ open: [BoardItem] }>()
const t = messages.celebrations.trophies

const progressText = computed(() => {
  const { value, next, unit, hidden, levels } = props.item
  // A one-step trophy that's earned or not (a perfect week, a surprise) has nothing to count toward.
  if (hidden || value === null || next === null || (levels === 1 && next <= 1)) return ''
  if (!value && !props.item.level) return ''
  return t.progress(Math.min(value, next), next, unit)
})
const aboutText = computed(() => (props.item.hidden ? t.hiddenHint : (t.about[props.item.id] ?? '')))
</script>
