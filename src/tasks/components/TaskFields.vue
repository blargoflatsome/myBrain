<template>
  <!-- SPEC §5 Forms: a task's date, notes and priority, the same in Capture and the task editor. -->
  <DateInput :model-value="dueDate" :label="m.taskDateLabel" :hint="m.taskDateHint" :input-class="fieldClass" @update:model-value="emit('update:dueDate', $event)" />
  <NotesEditor :model-value="notes" :label="m.notesLabel" :test-id="notesTestId" @update:model-value="emit('update:notes', $event)" />
  <PriorityPicker :model-value="priority" @update:model-value="emit('update:priority', $event)" />
  <!-- SPEC §5 High-priority tasks: a High task with a date can have a full-screen reminder. -->
  <div v-if="priority === HIGH && dueDate" class="flex flex-col" data-testid="task-reminder">
    <TimeInput :model-value="reminderTime" :label="t.reminderLabel" :input-class="fieldClass" @update:model-value="emit('update:reminderTime', $event)" />
    <p class="pt-1 text-sm text-muted">{{ t.reminderHint }}</p>
    <p v-if="reminderError" class="pt-1 text-danger" role="alert">{{ reminderError }}</p>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Forms: the one task form (Capture and the task editor); the editor adds tags after it.
import DateInput from '@/components/DateInput.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import TimeInput from '@/components/TimeInput.vue'
import PriorityPicker from '@/tasks/components/PriorityPicker.vue'
import { HIGH } from '@/tasks/rules'
import { messages } from '@/messages'
import { field } from '@/ui/styles'

withDefaults(
  defineProps<{ dueDate: string; notes: string; priority: number; reminderTime?: string; reminderError?: string; fieldClass?: string; notesTestId?: string }>(),
  { reminderTime: '', reminderError: '', fieldClass: field, notesTestId: 'task-notes' },
)
const emit = defineEmits<{ 'update:dueDate': [value: string]; 'update:notes': [value: string]; 'update:priority': [value: number]; 'update:reminderTime': [value: string] }>()
const m = messages.capture
const t = messages.tasks
</script>
