<template>
  <component
    :is="tag"
    ref="root"
    class="flex min-w-0 items-center gap-2 py-2 pr-2 pl-4"
    :class="inBox ? '' : 'rounded-2xl border border-dashed border-line'"
    data-testid="undo-line"
  >
    <span :id="messageId" class="min-w-0 flex-1 text-sm text-muted [overflow-wrap:anywhere]" data-testid="undo-message">{{ line.message }}</span>
    <button
      ref="button"
      type="button"
      class="min-h-11 shrink-0 rounded-xl border border-accent px-4 font-semibold text-accent"
      :aria-describedby="messageId"
      data-testid="undo-button"
      @click="emit('undo', root)"
    >
      {{ messages.undo.undo }}
    </button>
  </component>
</template>

<script setup lang="ts">
// SPEC §2 Undo in place: the line a removed row leaves behind. I just did it (pressed its trash can, Move or Clear), so
// focus moves to its Undo, which sits where I already was; once an editor window it came from has closed, if it came
// from one. Screen readers hear what Undo undoes (the line's text describes the button).
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { focusWhenFree } from '@/a11y/focus'
import { messages } from '@/messages'
import { firstAppearance, type UndoLine } from '@/composables/useUndoInPlace'

/** `inBox`: a row of a list drawn as one box with lines between its rows, so it has no border of its own. */
const props = withDefaults(defineProps<{ line: UndoLine; tag?: string; inBox?: boolean }>(), { tag: 'li', inBox: false })
const emit = defineEmits<{ undo: [el: HTMLElement | null] }>()

const messageId = useId()
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
let stopWaiting = () => {}
// Only when it first appears: drawn again later (back on a tab), it leaves focus alone.
onMounted(() => {
  if (button.value && firstAppearance(props.line)) stopWaiting = focusWhenFree(button.value)
})
onBeforeUnmount(() => stopWaiting())
</script>
