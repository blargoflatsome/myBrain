<template>
  <!-- SPEC §5 Forms: a Post It's colour, the same in Capture and when editing a note in place. -->
  <fieldset class="flex flex-col gap-2">
    <!-- On a note the label takes the note's ink, for contrast on the paper colours. -->
    <legend class="mb-1 pb-2 text-sm text-muted [.postit-card_&]:text-current">{{ m.color }}</legend>
    <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="m.color">
      <button
        v-for="c in POST_IT_COLORS"
        :key="c"
        type="button"
        role="radio"
        :aria-checked="modelValue === c"
        :class="['min-h-11 rounded-full border-2 px-4 text-sm font-medium', `note-${c}`, modelValue === c ? 'border-current' : 'border-black/10']"
        @click="emit('update:modelValue', c)"
      >
        <span v-if="modelValue === c" aria-hidden="true">✓ </span>{{ m.colors[c] }}
      </button>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
// SPEC §5 Forms: the one Post It colour picker (Capture and the Dashboard's in-place editor).
import type { PostItColor } from '@/sync/types'
import { POST_IT_COLORS } from '@/postits/rules'
import { messages } from '@/messages'

defineProps<{ modelValue: PostItColor }>()
const emit = defineEmits<{ 'update:modelValue': [color: PostItColor] }>()
const m = messages.postIts
</script>
