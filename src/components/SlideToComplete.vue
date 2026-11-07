<script setup lang="ts">
// SPEC §5: a priority reminder must be marked complete with a slider, so it can't be dismissed by a stray tap.
// A range input keeps it usable by keyboard and screen readers; it completes only at the far right.
import { ref } from 'vue'

const props = defineProps<{ label: string; hint: string }>()
const emit = defineEmits<{ complete: [] }>()
const value = ref(0)

function release() {
  if (value.value >= 95) emit('complete')
  else value.value = 0
}
function onInput() {
  // Keyboard users: reaching the end completes immediately.
  if (value.value >= 100) emit('complete')
}
</script>

<template>
  <div class="relative">
    <input
      v-model.number="value"
      type="range"
      min="0"
      max="100"
      step="1"
      class="slide h-16 w-full cursor-grab appearance-none rounded-full bg-surface"
      :aria-label="props.label"
      :aria-describedby="'slide-hint'"
      @change="release"
      @pointerup="release"
      @input="onInput"
    >
    <span
      class="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-semibold text-muted"
      :style="{ opacity: String(1 - value / 100) }"
      aria-hidden="true"
    >{{ props.label }} →</span>
    <span id="slide-hint" class="sr-only">{{ props.hint }}</span>
  </div>
</template>

<style scoped>
.slide::-webkit-slider-thumb {
  appearance: none;
  width: 4rem;
  height: 4rem;
  border-radius: 9999px;
  background: var(--accent);
  border: 4px solid var(--surface);
}
.slide::-moz-range-thumb {
  width: 4rem;
  height: 4rem;
  border-radius: 9999px;
  background: var(--accent);
  border: 4px solid var(--surface);
}
</style>
