<template>
  <dialog
    ref="dialog"
    :class="dialogBox"
    :aria-label="isNew ? m.editor.newHeading : m.editor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ isNew ? m.editor.newHeading : m.editor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.title }}
        <input v-model="title" maxlength="500" required :class="field">
      </label>
      <TimeInput v-model="notifyTime" :label="m.editor.notifyTime" :input-class="field" />
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.timer }}
        <select v-model="timer" :disabled="timerDisabled" :class="[field, 'disabled:opacity-50']">
          <option :value="null">{{ m.editor.timerNone }}</option>
          <option v-for="t in timerOptions" :key="t" :value="t">{{ m.editor.timerOptions[t] }}</option>
        </select>
        <span class="text-xs">{{ m.editor.timerHint }}</span>
      </label>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm text-muted">{{ m.editor.weekdays }}</legend>
        <div class="flex flex-wrap gap-1.5" role="group" :aria-label="m.editor.weekdays">
          <button
            v-for="d in ALL_WEEKDAYS"
            :key="d"
            type="button"
            :class="dayChip(weekdays.includes(d))"
            :aria-pressed="weekdays.includes(d)"
            @click="toggleDay(d)"
          >
            {{ m.weekdayNames[d] }}
          </button>
        </div>
      </fieldset>
      <HowOften v-model="weekInterval" />
      <label class="flex items-start gap-3">
        <input v-model="isPrivate" type="checkbox" class="mt-1 size-5 accent-[var(--accent)]">
        <span>
          <span class="font-medium">{{ m.editor.private }}</span>
          <span class="block text-sm text-muted">{{ m.editor.privateHint }}</span>
        </span>
      </label>
      <label class="flex items-start gap-3">
        <input v-model="isPriority" type="checkbox" class="mt-1 size-5">
        <span>
          <span class="font-medium">{{ m.editor.priority }}</span>
          <span class="block text-sm text-muted">{{ m.editor.priorityHint }}</span>
        </span>
      </label>
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button v-if="!isNew" type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.open()">
        {{ m.editor.delete }}
      </button>
    </form>
  </dialog>

  <ConfirmDialog
    ref="confirmDialog"
    :heading="m.confirmDelete.heading"
    :body="m.confirmDelete.body(habit?.title ?? '')"
    :confirm-label="m.confirmDelete.confirm"
    :keep-label="m.confirmDelete.keep"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
import TimeInput from '@/components/TimeInput.vue'
import HowOften from '@/components/HowOften.vue'
// New or edit habit: title, reminder time, timer, weekdays, private (SPEC §5 Habits). Delete asks first (SPEC §2).
import { computed, ref, watch } from 'vue'
import type { HabitRow } from '@/sync/types'
import { ALL_WEEKDAYS } from '@/habits/rules'
import { messages } from '@/messages'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { dayChip, dialogBox, field } from '@/ui/styles'

const props = defineProps<{ habit: HabitRow | null; isNew?: boolean }>()
const emit = defineEmits<{ save: [HabitRow]; delete: [HabitRow]; close: [] }>()
const m = messages.habits

const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const title = ref('')
const notifyTime = ref('')
const timer = ref<number | null>(null)
const weekdays = ref<number[]>([...ALL_WEEKDAYS])
const weekInterval = ref(1)
const isPrivate = ref(false)
const isPriority = ref(false)
const timerOptions = [15, 30, 60, 120, 180, 240]

watch(
  () => props.habit,
  (h) => {
    if (!h) return dialog.value?.close()
    title.value = h.title
    notifyTime.value = h.notify_time?.slice(0, 5) ?? ''
    timer.value = h.timer_minutes ?? null
    weekdays.value = [...h.weekdays]
    weekInterval.value = h.week_interval ?? 1
    isPrivate.value = h.is_private
    isPriority.value = !!h.is_priority
    dialog.value?.showModal()
  },
)

// A timer starts at the reminder time, so it needs one.
const timerDisabled = computed(() => !notifyTime.value)
watch(notifyTime, (t) => {
  if (!t) timer.value = null
})

function toggleDay(d: number) {
  const has = weekdays.value.includes(d)
  if (has && weekdays.value.length === 1) return // at least one day
  weekdays.value = has ? weekdays.value.filter((x) => x !== d) : [...weekdays.value, d].sort()
}

function save() {
  if (!props.habit || !title.value.trim()) return
  emit('save', {
    ...props.habit,
    title: title.value.trim(),
    notify_time: notifyTime.value || null,
    timer_minutes: notifyTime.value ? timer.value : null,
    weekdays: weekdays.value,
    week_interval: weekInterval.value,
    is_private: isPrivate.value,
    is_priority: isPriority.value,
  })
}

function confirmDelete() {
  if (props.habit) emit('delete', props.habit)
  confirmDialog.value?.close()
}

</script>
