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
      <HabitFields
        v-model:week-interval="weekInterval"
        v-model:monthly="monthly"
        v-model:weekdays="weekdays"
        v-model:start-date="startDate"
        v-model:notify-time="notifyTime"
        v-model:timer="timer"
        v-model:is-priority="isPriority"
        v-model:is-private="isPrivate"
        :min-start="earliestStart"
        :field-class="field"
        :more-open="moreOpen"
      >
        <template #more>
          <TagInput v-model="tags.names.value" />
        </template>
      </HabitFields>
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button v-if="!isNew" type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.open()">
        {{ m.editor.delete }}
      </button>
    </form>
    <CloseX @click="dialog?.close()" />
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
import CloseX from '@/components/CloseX.vue'
import HabitFields from '@/components/HabitFields.vue'
// New or edit habit: title, reminder time, timer, weekdays, private (SPEC §5 Habits). Delete asks first (SPEC §2).
import { computed, ref, watch } from 'vue'
import type { HabitRow } from '@/sync/types'
import { ALL_WEEKDAYS } from '@/habits/rules'
import { messages } from '@/messages'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { dialogBox, field } from '@/ui/styles'
import TagInput from '@/components/TagInput.vue'
import { useItemTags } from '@/composables/useItemTags'
import { deviceTimeZone, todayIn } from '@/tasks/days'

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
const monthly = ref(false)
const startDate = ref('')
const tags = useItemTags('habit', computed(() => props.habit?.id))
const isPrivate = ref(false)
const isPriority = ref(false)
// More details opens by itself when the habit is private or has tags.
const moreOpen = ref(false)
watch(() => tags.names.value.length, (n) => {
  if (n) moreOpen.value = true
})

watch(
  () => props.habit,
  (h) => {
    if (!h) return dialog.value?.close()
    title.value = h.title
    notifyTime.value = h.notify_time?.slice(0, 5) ?? ''
    timer.value = h.timer_minutes ?? null
    weekdays.value = [...h.weekdays]
    weekInterval.value = h.week_interval ?? 1
    monthly.value = !!h.monthly
    startDate.value = h.start_date
    isPrivate.value = h.is_private
    isPriority.value = !!h.is_priority
    moreOpen.value = h.is_private || tags.names.value.length > 0
    dialog.value?.showModal()
  },
)

// A habit starts today or later (an earlier start would count days already gone as missed); an existing habit
// can keep the start date it has.
const earliestStart = computed(() => {
  const today = todayIn(deviceTimeZone())
  return props.habit && !props.isNew && props.habit.start_date < today ? props.habit.start_date : today
})

function save() {
  if (!props.habit || !title.value.trim()) return
  void tags.save(props.habit.id)
  emit('save', {
    ...props.habit,
    title: title.value.trim(),
    notify_time: notifyTime.value || null,
    timer_minutes: notifyTime.value ? timer.value : null,
    weekdays: weekdays.value,
    week_interval: weekInterval.value,
    monthly: monthly.value,
    start_date: startDate.value || props.habit.start_date,
    is_private: isPrivate.value,
    is_priority: isPriority.value,
  })
}

function confirmDelete() {
  if (props.habit) emit('delete', props.habit)
  confirmDialog.value?.close()
}

</script>
