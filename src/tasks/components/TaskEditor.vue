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
    <TaskFields v-model:due-date="dueDate" v-model:notes="notes" v-model:priority="priority" v-model:reminder-time="reminderTime" :reminder-error="reminderError" />
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
import { reminderInPast, taskReminder } from '@/reminders/priority'

const props = withDefaults(defineProps<{ task: TaskRow | null; isNew?: boolean }>(), { isNew: false })
const emit = defineEmits<{ save: [TaskRow]; delete: [TaskRow]; close: [] }>()
const m = messages.tasks

const tags = useItemTags('task', computed(() => props.task?.id))
const title = ref('')
const notes = ref('')
const dueDate = ref('')
const priority = ref<number>(DEFAULT_PRIORITY)
const reminderTime = ref('')
const reminderError = ref('')

watch(
  () => props.task,
  (t) => {
    if (!t) return
    title.value = t.title
    notes.value = t.notes ?? ''
    dueDate.value = t.due_date ?? ''
    priority.value = t.priority ?? DEFAULT_PRIORITY
    reminderTime.value = t.reminder_time?.slice(0, 5) ?? ''
    reminderError.value = ''
  },
)

async function save() {
  if (!props.task || !title.value.trim()) return
  const due_date = dueDate.value || null
  const reminder_time = taskReminder(priority.value, due_date, reminderTime.value)
  // SPEC §5 High-priority tasks: saving never sets a reminder off at once.
  if (reminderInPast({ due_date, reminder_time }, props.isNew ? null : props.task)) {
    reminderError.value = messages.tasks.reminderPast
    return
  }
  await tags.save(props.task.id)
  emit('save', {
    ...props.task,
    title: title.value.trim(),
    notes: storedNotes(notes.value),
    due_date,
    priority: priority.value,
    reminder_time,
  })
}

function deleteNow() {
  if (props.task) emit('delete', props.task)
}

</script>
