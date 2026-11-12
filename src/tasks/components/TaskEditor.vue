<template>
  <EditorDialog
    :open="!!task"
    :heading="isNew ? m.editor.newHeading : m.editor.heading"
    :save-label="m.editor.save"
    :close-label="m.editor.close"
    :delete-label="isNew ? null : m.editor.delete"
    @save="save"
    @delete="deleteNow"
    @close="emit('close')"
  >
    <TitleField v-model="title" :label="m.editor.title" />
    <TaskFields v-model:due-date="dueDate" v-model:notes="notes" v-model:priority="priority" />
    <TagInput v-model="tags.names.value" />
  </EditorDialog>
</template>

<script setup lang="ts">
// Edit a task: title, the shared task fields (TaskFields), then tags; Delete asks first (SPEC §2 Confirm before impact).
import EditorDialog from '@/components/EditorDialog.vue'
import TaskFields from '@/tasks/components/TaskFields.vue'
import TitleField from '@/components/TitleField.vue'
import { computed, ref, watch } from 'vue'
import TagInput from '@/tags/components/TagInput.vue'
import { useItemTags } from '@/tags/useItemTags'
import type { TaskRow } from '@/sync/types'
import { DEFAULT_PRIORITY } from '@/tasks/rules'
import { messages } from '@/messages'
import { storedNotes } from '@/journal/body'

const props = withDefaults(defineProps<{ task: TaskRow | null; isNew?: boolean }>(), { isNew: false })
const emit = defineEmits<{ save: [TaskRow]; delete: [TaskRow]; close: [] }>()
const m = messages.tasks

const tags = useItemTags('task', computed(() => props.task?.id))
const title = ref('')
const notes = ref('')
const dueDate = ref('')
const priority = ref<number>(DEFAULT_PRIORITY)

watch(
  () => props.task,
  (t) => {
    if (!t) return
    title.value = t.title
    notes.value = t.notes ?? ''
    dueDate.value = t.due_date ?? ''
    priority.value = t.priority ?? DEFAULT_PRIORITY
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
