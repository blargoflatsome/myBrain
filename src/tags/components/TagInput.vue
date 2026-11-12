<template>
  <div class="flex flex-col gap-1" data-testid="tag-input">
    <span class="pb-2 text-sm text-muted">{{ m.label }}</span>
    <div class="flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-control bg-bg px-2 py-1.5 focus-within:border-accent">
      <span v-for="name in modelValue" :key="name" class="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-sm" data-testid="tag-chip">
        #{{ name }}
        <button type="button" class="flex size-6 items-center justify-center rounded-full text-muted hover:text-ink" :aria-label="m.remove(name)" @click="remove(name)">
          ×
        </button>
      </span>
      <input
        v-model="typed"
        :list="listId"
        class="bare min-h-9 min-w-24 flex-1 bg-transparent px-1 text-base text-ink focus-visible:outline-none"
        :aria-label="m.add"
        :placeholder="modelValue.length ? '' : m.placeholder"
        autocomplete="off"
        enterkeyhint="done"
        @keydown="onKey"
        @change="add"
        @blur="add"
      >
      <datalist :id="listId">
        <option v-for="s in suggestions" :key="s" :value="s" />
      </datalist>
    </div>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Global search and tags: add tags by typing a name; my existing tags are suggested.
import { computed, ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { cleanTagName } from '@/tags/rules'
import { messages } from '@/messages'
import type { TagRow } from '@/sync/types'
import { live } from '@/sync/live'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [names: string[]] }>()
const m = messages.tags
const brain = useBrainStore()
const listId = `tag-suggestions-${Math.random().toString(36).slice(2)}`

const all = useLiveQuery<TagRow[]>(async () => (brain.db ? live(await brain.db.tags.toArray()) : []), [], [() => brain.db])
const suggestions = computed(() => {
  const chosen = new Set(props.modelValue.map((n) => n.toLowerCase()))
  return all.value.map((t) => t.name).filter((n) => !chosen.has(n.toLowerCase())).sort((a, b) => a.localeCompare(b))
})

const typed = ref('')
function add() {
  const name = cleanTagName(typed.value.replace(/,$/, ''))
  typed.value = ''
  if (!name || props.modelValue.some((n) => n.toLowerCase() === name.toLowerCase())) return
  // Use the existing tag's spelling when there is one.
  const existing = all.value.find((t) => t.name.toLowerCase() === name.toLowerCase())
  emit('update:modelValue', [...props.modelValue, existing?.name ?? name])
}
function remove(name: string) {
  emit('update:modelValue', props.modelValue.filter((n) => n !== name))
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    add()
  } else if (event.key === 'Backspace' && !typed.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1]!)
  }
}
</script>
