<template>
  <dialog ref="dialog" :class="dialogBox" :aria-label="m.heading" @close="emit('close')">
    <div class="flex flex-col gap-6 p-5">
      <h2 class="text-lg font-semibold">{{ m.heading }}</h2>

      <form class="flex flex-col gap-3" @submit.prevent="save">
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.name }}
          <input v-model="name" :maxlength="TAG_MAX" required :class="field" @input="clash = null">
        </label>
        <div v-if="clash" class="flex flex-col gap-3 rounded-xl bg-bg p-3" role="alert" data-testid="tag-clash">
          <p class="text-sm break-words">{{ m.clash(clash.name) }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="mergeInto(clash)">{{ m.clashYes }}</button>
            <button type="button" class="min-h-11 rounded-xl border border-line px-4" @click="clash = null">{{ m.clashNo }}</button>
          </div>
        </div>
        <div v-else class="flex gap-2">
          <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.save }}</button>
          <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.close }}</button>
        </div>
      </form>

      <section v-if="others.length" class="flex flex-col gap-3" aria-labelledby="tag-merge-heading">
        <h3 id="tag-merge-heading" class="font-medium">{{ m.merge }}</h3>
        <p class="text-sm break-words text-muted">{{ m.mergeHint(tag?.name ?? '') }}</p>
        <div class="flex flex-wrap gap-2">
          <select v-model="target" :class="[field, 'min-w-0 flex-1']" :aria-label="m.mergeChoose">
            <option value="">{{ m.mergeChoose }}</option>
            <option v-for="t in others" :key="t.id" :value="t.id">#{{ t.name }}</option>
          </select>
          <button type="button" class="min-h-12 rounded-xl border border-line px-4 disabled:opacity-50" :disabled="!target" @click="mergeChosen">{{ m.mergeButton }}</button>
        </div>
      </section>

      <div class="flex flex-col items-start gap-1">
        <button type="button" class="min-h-11 text-sm text-danger underline" @click="tag && emit('delete', tag)">{{ m.delete }}</button>
        <p class="text-xs text-muted">{{ m.deleteHint }}</p>
      </div>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Tags page: one tag's window: rename it (a name another tag has offers to merge), merge it into another
// tag, or delete it. The page does the work and offers Undo.
import { computed, ref, watch } from 'vue'
import CloseX from '@/components/CloseX.vue'
import { TAG_MAX } from '@/tags/rules'
import { messages } from '@/messages'
import type { TagRow } from '@/sync/types'
import { dialogBox, field } from '@/ui/styles'

const props = defineProps<{ tag: TagRow | null; tags: TagRow[] }>()
const emit = defineEmits<{
  rename: [tag: TagRow, name: string, done: (clash: TagRow | null) => void]
  merge: [from: TagRow, into: TagRow]
  delete: [TagRow]
  close: []
}>()
const m = messages.tagsPage.editor

const dialog = ref<HTMLDialogElement | null>(null)
const name = ref('')
const target = ref('')
const clash = ref<TagRow | null>(null)
const others = computed(() => props.tags.filter((t) => t.id !== props.tag?.id))

watch(
  () => props.tag,
  (t) => {
    if (!t) return dialog.value?.close()
    name.value = t.name
    target.value = ''
    clash.value = null
    if (!dialog.value?.open) dialog.value?.showModal()
  },
)

function save() {
  if (!props.tag) return
  emit('rename', props.tag, name.value, (other) => (clash.value = other))
}
function mergeInto(into: TagRow) {
  if (props.tag) emit('merge', props.tag, into)
}
function mergeChosen() {
  const into = others.value.find((t) => t.id === target.value)
  if (into) mergeInto(into)
}
</script>
