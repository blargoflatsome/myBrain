<template>
  <EditorDialog
    :open="!!task"
    :heading="m.editor.heading"
    :save-label="m.editor.save"
    :close-label="m.editor.close"
    :delete-label="m.editor.delete"
    @save="save"
    @delete="deleteNow"
    @close="emit('close')"
  >
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.editor.title }}</span>
      <input v-model="title" maxlength="500" required :class="field">
    </label>
    <DateInput v-model="dueDate" :label="m.editor.date" :hint="m.editor.dateHint" :input-class="field" />
    <NotesEditor v-model="notes" :label="m.editor.notes" test-id="task-notes" />
    <MoreOptions :summary="m.editor.moreSummary" :start-open="hasExtras" test-id="task-more">
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm text-muted pb-2">{{ m.priorityLabel }}</legend>
        <div class="grid grid-cols-3 gap-2">
          <label
            v-for="p in PRIORITIES"
            :key="p.level"
            class="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line px-2 text-sm has-[:checked]:border-accent has-[:checked]:font-semibold"
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
  </EditorDialog>
</template>

<script setup lang="ts">
// Edit a task: title, notes, date (blank = Undated), priority; Delete asks first (SPEC §2 Confirm before impact).
import EditorDialog from '@/components/EditorDialog.vue'
import { computed, ref, watch } from 'vue'
import TagInput from '@/tags/components/TagInput.vue'
import { useItemTags } from '@/tags/useItemTags'
import type { TaskRow } from '@/sync/types'
import { PRIORITIES, DEFAULT_PRIORITY } from '@/tasks/rules'
import { messages } from '@/messages'
import DateInput from '@/components/DateInput.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import { storedNotes } from '@/journal/body'
import { field, fieldLabel, priorityDot } from '@/ui/styles'

const props = defineProps<{ task: TaskRow | null }>()
const emit = defineEmits<{ save: [TaskRow]; delete: [TaskRow]; close: [] }>()
const m = messages.tasks

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
    if (!t) return
    title.value = t.title
    notes.value = t.notes ?? ''
    dueDate.value = t.due_date ?? ''
    priority.value = t.priority ?? DEFAULT_PRIORITY
    hasExtras.value = !!t.notes || priority.value !== DEFAULT_PRIORITY || tags.names.value.length > 0
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
