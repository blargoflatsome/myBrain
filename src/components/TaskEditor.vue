<template>
  <dialog
    ref="dialog"
    :class="dialogBox"
    :aria-label="m.editor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ m.editor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.title }}
        <input v-model="title" maxlength="500" required :class="field">
      </label>
      <DateInput v-model="dueDate" :label="m.editor.date" :hint="m.editor.dateHint" :input-class="field" />
      <NotesEditor v-model="notes" :label="m.editor.notes" test-id="task-notes" />
      <MoreOptions :summary="m.editor.moreSummary" :start-open="hasExtras" test-id="task-more">
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ m.priorityLabel }}</legend>
          <div class="grid grid-cols-3 gap-2">
            <label
              v-for="p in PRIORITIES"
              :key="p.level"
              class="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 text-sm has-[:checked]:border-accent has-[:checked]:font-semibold"
              :class="'border-line'"
            >
              <input v-model="priority" type="radio" name="priority" :value="p.level" class="sr-only">
              <span
                class="size-2.5 rounded-full"
                :class="priorityDot[p.key]"
                aria-hidden="true"
              />
              {{ m.priority[p.key] }}
            </label>
          </div>
        </fieldset>
        <TagInput v-model="tags.names.value" />
      </MoreOptions>
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button type="button" class="self-start text-sm text-danger underline" @click="deleteNow">
        {{ m.editor.delete }}
      </button>
    </form>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// Edit a task: title, notes, date (blank = Undated), priority; Delete asks first (SPEC §2 Confirm before impact).
import CloseX from '@/components/CloseX.vue'
import { computed, ref, watch } from 'vue'
import TagInput from '@/components/TagInput.vue'
import { useItemTags } from '@/composables/useItemTags'
import type { TaskRow } from '@/sync/types'
import { PRIORITIES, DEFAULT_PRIORITY } from '@/tasks/rules'
import { messages } from '@/messages'
import DateInput from '@/components/DateInput.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import { storedNotes } from '@/journal/body'
import { dialogBox, field, priorityDot } from '@/ui/styles'

const props = defineProps<{ task: TaskRow | null }>()
const emit = defineEmits<{ save: [TaskRow]; delete: [TaskRow]; close: [] }>()
const m = messages.tasks

const dialog = ref<HTMLDialogElement | null>(null)
const tags = useItemTags('task', computed(() => props.task?.id))
const title = ref('')
const notes = ref('')
const dueDate = ref('')
const priority = ref<number>(DEFAULT_PRIORITY)
// More details opens by itself when something in it is already set.
const hasExtras = ref(false)
watch(() => tags.names.value.length, (n) => {
  if (n) hasExtras.value = true
})

watch(
  () => props.task,
  (t) => {
    if (!t) {
      dialog.value?.close()
      return
    }
    title.value = t.title
    notes.value = t.notes ?? ''
    dueDate.value = t.due_date ?? ''
    priority.value = t.priority ?? DEFAULT_PRIORITY
    hasExtras.value = !!t.notes || priority.value !== DEFAULT_PRIORITY || tags.names.value.length > 0
    dialog.value?.showModal()
  },
)

async function save() {
  if (!props.task || !title.value.trim()) return
  await tags.save(props.task.id)
  emit('save', {
    ...props.task,
    title: title.value.trim(),
    notes: storedNotes(notes.value),
    due_date: dueDate.value || null,
    priority: priority.value,
  })
}

function deleteNow() {
  if (props.task) emit('delete', props.task)
}

</script>
