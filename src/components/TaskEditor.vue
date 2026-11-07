<script setup lang="ts">
// Edit a task: title, notes, date (blank = Undated), priority; Delete asks first (SPEC §2 Confirm before impact).
import { computed, ref, watch } from 'vue'
import TagInput from '@/components/TagInput.vue'
import { useItemTags } from '@/composables/useItemTags'
import type { TaskRow } from '@/sync/types'
import { PRIORITIES, DEFAULT_PRIORITY } from '@/tasks/rules'
import { messages } from '@/messages'

const props = defineProps<{ task: TaskRow | null }>()
const emit = defineEmits<{ save: [TaskRow]; delete: [TaskRow]; close: [] }>()
const m = messages.tasks

const dialog = ref<HTMLDialogElement | null>(null)
const tags = useItemTags('task', computed(() => props.task?.id))
const confirmDialog = ref<HTMLDialogElement | null>(null)
const title = ref('')
const notes = ref('')
const dueDate = ref('')
const priority = ref<number>(DEFAULT_PRIORITY)

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
    dialog.value?.showModal()
  },
)

async function save() {
  if (!props.task || !title.value.trim()) return
  await tags.save(props.task.id)
  emit('save', {
    ...props.task,
    title: title.value.trim(),
    notes: notes.value.trim() || null,
    due_date: dueDate.value || null,
    priority: priority.value,
  })
}

function confirmDelete() {
  if (props.task) emit('delete', props.task)
  confirmDialog.value?.close()
}

const field = 'min-h-12 rounded-xl border border-line bg-bg px-3 text-base text-ink'
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    :aria-label="m.editor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ m.editor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.title }}
        <input v-model="title" required :class="field">
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.notes }}
        <textarea v-model="notes" rows="2" :class="[field, 'py-2']" />
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.date }}
        <input v-model="dueDate" type="date" :class="field">
        <span class="text-xs">{{ m.editor.dateHint }}</span>
      </label>
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
              :class="{ high: 'bg-red-500', medium: 'bg-yellow-400', low: 'bg-green-500' }[p.key]"
              aria-hidden="true"
            />
            {{ m.priority[p.key] }}
          </label>
        </div>
      </fieldset>
      <TagInput v-model="tags.names.value" />
      <div class="flex flex-wrap gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.showModal()">
        {{ m.editor.delete }}
      </button>
    </form>
  </dialog>

  <dialog
    ref="confirmDialog"
    class="m-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
    role="alertdialog"
    :aria-label="m.confirmDelete.heading"
  >
    <h2 class="text-lg font-semibold">{{ m.confirmDelete.heading }}</h2>
    <p class="mt-2 text-muted">{{ m.confirmDelete.body(task?.title ?? '') }}</p>
    <div class="mt-4 flex gap-2">
      <button type="button" class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-danger-ink" @click="confirmDelete">
        {{ m.confirmDelete.confirm }}
      </button>
      <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmDialog?.close()">
        {{ m.confirmDelete.keep }}
      </button>
    </div>
  </dialog>
</template>
