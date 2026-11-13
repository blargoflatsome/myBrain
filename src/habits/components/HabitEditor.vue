<template>
  <EditorDialog
    :open="!!habit"
    :heading="isNew ? m.editor.newHeading : m.editor.heading"
    :save-label="m.editor.save"
    :close-label="m.editor.close"
    :delete-label="isNew ? null : m.editor.delete"
    @save="save"
    @delete="confirmDialog?.open()"
    @close="emit('close')"
  >
    <TitleField v-model="title" :label="m.editor.title" />
    <HabitFields
      v-model:week-interval="weekInterval"
      v-model:monthly="monthly"
      v-model:weekdays="weekdays"
      v-model:start-date="startDate"
      v-model:notify-time="notifyTime"
      v-model:timer="timer"
      v-model:is-priority="isPriority"
      :min-start="earliestStart"
      :field-class="field"
      :reminders-open="remindersOpen"
    >
      <template #more>
        <TagInput v-model="tags.names.value" />
      </template>
    </HabitFields>
  </EditorDialog>

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
import EditorDialog from '@/components/EditorDialog.vue'
import TitleField from '@/components/TitleField.vue'
import HabitFields from '@/habits/components/HabitFields.vue'
// New or edit habit: title, reminder time, timer, weekdays (SPEC §5 Habits). Delete asks first (SPEC §2).
import { computed, ref, watch } from 'vue'
import type { HabitRow } from '@/sync/types'
import { ALL_WEEKDAYS } from '@/habits/rules'
import { messages } from '@/messages'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { field } from '@/ui/styles'
import TagInput from '@/tags/components/TagInput.vue'
import { useItemTags } from '@/tags/useItemTags'
import { deviceTimeZone, todayIn } from '@/tasks/days'

const props = defineProps<{ habit: HabitRow | null; isNew?: boolean }>()
const emit = defineEmits<{ save: [HabitRow]; delete: [HabitRow]; close: [] }>()
const m = messages.habits

const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const title = ref('')
const notifyTime = ref('')
const timer = ref<number | null>(null)
const weekdays = ref<number[]>([...ALL_WEEKDAYS])
const weekInterval = ref(1)
const monthly = ref(false)
const startDate = ref('')
const tags = useItemTags('habit', computed(() => props.habit?.id))
const isPriority = ref(false)
// Reminders opens by itself when the habit has a reminder time or is a priority, so nothing set is hidden.
const remindersOpen = ref(false)

watch(
  () => props.habit,
  (h) => {
    if (!h) return
    title.value = h.title
    notifyTime.value = h.notify_time?.slice(0, 5) ?? ''
    timer.value = h.timer_minutes ?? null
    weekdays.value = [...h.weekdays]
    weekInterval.value = h.week_interval ?? 1
    monthly.value = !!h.monthly
    startDate.value = h.start_date
    isPriority.value = !!h.is_priority
    remindersOpen.value = !!h.notify_time || !!h.is_priority
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
    is_priority: isPriority.value,
  })
}

function confirmDelete() {
  if (props.habit) emit('delete', props.habit)
  confirmDialog.value?.close()
}

</script>
