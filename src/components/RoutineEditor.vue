<template>
  <dialog
    ref="dialog"
    :class="dialogBox"
    :aria-label="isNew ? m.editor.newHeading : m.editor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-8 p-5" data-testid="routine-form" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ isNew ? m.editor.newHeading : m.editor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        <span class="pb-2">{{ m.editor.title }}</span>
        <input v-model="title" maxlength="500" required :class="field">
      </label>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium pb-2">{{ m.editor.steps }}</legend>
        <p v-if="stepRows.length > 1" class="-mt-1 text-xs text-muted">{{ m.editor.dragHint }}</p>
        <ol ref="stepList" class="flex flex-col gap-2">
          <li v-for="(s, i) in stepRows" :key="s.key" class="flex flex-wrap items-center gap-1.5" data-testid="routine-step-row">
            <button
              type="button"
              class="drag-handle flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-xl text-muted active:cursor-grabbing"
              :aria-label="m.editor.drag(s.title || m.editor.stepLabel(i + 1))"
              :data-handle="s.key"
              :aria-expanded="moving === s.key"
              @keydown="moveByKey($event, i)"
              @click="moving = moving === s.key ? null : s.key"
            >
              <span aria-hidden="true">⠿</span>
            </button>
            <span
              v-if="s.habitId"
              class="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-accent/50 bg-bg px-3 text-base"
              data-testid="habit-step"
            >
              <span class="truncate">{{ habitById(s.habitId)?.title ?? s.title }}</span>
              <span v-if="habitById(s.habitId)?.is_priority" class="text-carried" role="img" :aria-label="messages.habits.priorityBadge"><AppIcon name="alert" /></span>
              <span class="ml-auto shrink-0 text-xs text-muted">{{ m.editor.habitTag }}</span>
            </span>
            <input v-else v-model="s.title" maxlength="500" :aria-label="m.editor.stepLabel(i + 1)" :placeholder="m.editor.stepLabel(i + 1)" :class="[field, 'min-w-0 flex-1']">
            <button type="button" :class="small" :aria-label="m.editor.removeStep(s.title)" @click="remove(i)">✕</button>
            <div v-if="moving === s.key" class="flex w-full gap-2 pl-12" role="group" :aria-label="m.editor.moveGroup(s.title || m.editor.stepLabel(i + 1))">
              <button type="button" class="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm" :disabled="i === 0" :data-move="s.key" :data-step="-1" @click="moveByButton(i, -1)">↑ {{ messages.moveUp }}</button>
              <button type="button" class="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm" :disabled="i === stepRows.length - 1" :data-move="s.key" :data-step="1" @click="moveByButton(i, 1)">↓ {{ messages.moveDown }}</button>
            </div>
          </li>
        </ol>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="min-h-11 rounded-xl border border-dashed border-line px-3 text-sm" @click="addStep">{{ m.editor.addStep }}</button>
          <button
            v-if="habitChoices.length && !choosingHabit"
            type="button"
            class="min-h-11 rounded-xl border border-dashed border-line px-3 text-sm"
            @click="choosingHabit = true"
          >
            {{ m.editor.addHabit }}
          </button>
          <select v-if="choosingHabit" :class="[field, 'min-h-11']" :aria-label="m.editor.chooseHabit" @change="addHabitStep">
            <option value="">{{ m.editor.chooseHabit }}</option>
            <option v-for="h in habitChoices" :key="h.id" :value="h.id">{{ h.is_priority ? `${h.title} (${messages.habits.priorityBadge})` : h.title }}</option>
          </select>
        </div>
        <p v-if="stepRows.some((r) => r.habitId)" class="text-xs text-muted">{{ m.editor.habitHint }}</p>
      </fieldset>
      <!-- When it runs: how often with the days right under it, like habits (SPEC §5 Routines, §2 Calm by design) -->
      <fieldset class="flex flex-col gap-8" data-testid="routine-schedule">
        <legend class="mb-1 text-sm font-medium pb-2">{{ m.editor.when }}</legend>
        <label class="flex items-center justify-between gap-4">
          <span>
            <span class="font-medium">{{ m.editor.anytime }}</span>
            <span class="block text-xs text-muted">{{ m.editor.anytimeHint }}</span>
          </span>
          <input v-model="anytime" type="checkbox" class="size-5 shrink-0 accent-[var(--accent)]">
        </label>
        <template v-if="!anytime">
          <HowOften v-model="weekInterval" />
          <div class="flex flex-col gap-1">
            <span :id="`${uid}-days`" class="pb-2 text-sm text-muted">{{ m.editor.weekdays }}</span>
            <div class="flex flex-wrap gap-1.5" role="group" :aria-labelledby="`${uid}-days`">
              <button v-for="d in ALL_WEEKDAYS" :key="d" type="button" :class="dayChip(weekdays.includes(d))" :aria-pressed="weekdays.includes(d)" @click="toggleDay(d)">
                {{ dayNames[d] }}
              </button>
            </div>
          </div>
        </template>
      </fieldset>
      <TimeInput v-if="!anytime" v-model="notifyTime" :label="m.editor.notifyTime" :input-class="field" />
      <TagInput v-model="tags.names.value" />
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button v-if="!isNew" type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.open()">{{ m.editor.delete }}</button>
    </form>
    <CloseX @click="dialog?.close()" />
  </dialog>

  <ConfirmDialog
    ref="confirmDialog"
    :heading="m.confirmDelete.heading"
    :body="m.confirmDelete.body(routine?.title ?? '')"
    :confirm-label="m.confirmDelete.confirm"
    :keep-label="m.confirmDelete.keep"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
// New or edit routine: title, reminder time and weekdays (or run anytime), ordered steps that can be my own text or
// one of my habits (SPEC §5 Routines). Delete asks first (SPEC §2).
import AppIcon from '@/components/AppIcon.vue'
import CloseX from '@/components/CloseX.vue'
import TimeInput from '@/components/TimeInput.vue'
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import HowOften from '@/components/HowOften.vue'
import TagInput from '@/components/TagInput.vue'
import { useItemTags } from '@/composables/useItemTags'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { arrowStep, useDragSort } from '@/composables/useDragSort'
import type { HabitRow, RoutineRow, RoutineStepRow } from '@/sync/types'
import { ALL_WEEKDAYS } from '@/routines/rules'
import { messages } from '@/messages'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { dayChip, dialogBox, field } from '@/ui/styles'
import { live } from '@/sync/live'

const props = defineProps<{ routine: RoutineRow | null; steps: RoutineStepRow[]; isNew?: boolean }>()
const emit = defineEmits<{ save: [RoutineRow, { id?: string; title: string; habitId?: string | null }[]]; delete: [RoutineRow]; close: [] }>()
const m = messages.routines
const dayNames = messages.habits.weekdayNames

const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const title = ref('')
const notifyTime = ref('')
const weekdays = ref<number[]>([...ALL_WEEKDAYS])
const anytime = ref(false)
const weekInterval = ref(1)
const uid = useId()
const tags = useItemTags('routine', computed(() => props.routine?.id))
// More details opens by itself when the routine has tags.
const stepRows = ref<{ key: string; id?: string; title: string; habitId?: string | null }[]>([])

// My habits, for habit steps.
const brain = useBrainStore()
const habits = useLiveQuery<HabitRow[]>(
  async () => (brain.db ? live(await brain.db.habits.toArray()).sort((a, b) => a.title.localeCompare(b.title)) : []),
  [],
  [() => brain.db],
)
const habitById = (id: string | null | undefined) => habits.value.find((h) => h.id === id)
const habitChoices = computed(() => habits.value.filter((h) => !stepRows.value.some((r) => r.habitId === h.id)))
const choosingHabit = ref(false)
function addHabitStep(event: Event) {
  const select = event.target as HTMLSelectElement
  const habit = habitById(select.value)
  select.value = ''
  choosingHabit.value = false
  if (!habit) return
  // Replace an empty text step instead of leaving it behind.
  const last = stepRows.value[stepRows.value.length - 1]
  if (last && !last.habitId && !last.title.trim()) stepRows.value.pop()
  stepRows.value.push({ key: crypto.randomUUID(), title: habit.title, habitId: habit.id })
}

watch(
  () => props.routine,
  (r) => {
    if (!r) return dialog.value?.close()
    title.value = r.title
    notifyTime.value = r.notify_time?.slice(0, 5) ?? ''
    anytime.value = !r.weekdays
    weekInterval.value = r.week_interval ?? 1
    weekdays.value = r.weekdays ? [...r.weekdays] : [...ALL_WEEKDAYS]
    stepRows.value = props.steps.map((s) => ({ key: s.id, id: s.id, title: s.title, habitId: s.habit_id ?? null }))
    choosingHabit.value = false
    if (!stepRows.value.length) addStep()
    dialog.value?.showModal()
  },
)
// Steps download after their routine, so the editor can open a moment before they arrive. Fill them in then,
// as long as I haven't started on the blank step, so saving never drops steps I can't see yet.
watch(
  () => props.steps,
  (steps) => {
    const [only, ...more] = stepRows.value
    const untouchedBlank = !!only && !more.length && !only.id && !only.habitId && !only.title.trim()
    if (props.routine && steps.length && untouchedBlank) {
      stepRows.value = steps.map((s) => ({ key: s.id, id: s.id, title: s.title, habitId: s.habit_id ?? null }))
    }
  },
)

function addStep() {
  stepRows.value.push({ key: crypto.randomUUID(), title: '' })
}
/** Move a step from one place to another (saved with the routine). */
function reorder(from: number, to: number) {
  if (from === to || to < 0 || to >= stepRows.value.length) return
  const rows = [...stepRows.value]
  const [row] = rows.splice(from, 1)
  rows.splice(to, 0, row!)
  stepRows.value = rows
}
// Steps are sorted by dragging the handle; the arrow keys on the handle move a step too.
const stepList = ref<HTMLOListElement | null>(null)
useDragSort(stepList, reorder)
// Tapping a handle shows Move up / Move down, so steps can be sorted without dragging (WCAG 2.5.7).
const moving = ref<string | null>(null)
async function moveByButton(i: number, step: -1 | 1) {
  const key = stepRows.value[i]?.key
  reorder(i, i + step)
  await nextTick()
  const next = stepList.value?.querySelector<HTMLButtonElement>(`[data-move="${key}"][data-step="${step}"]`)
  if (next && !next.disabled) next.focus()
  else stepList.value?.querySelector<HTMLButtonElement>(`[data-move="${key}"][data-step="${-step}"]`)?.focus()
}
async function moveByKey(event: KeyboardEvent, i: number) {
  const step = arrowStep(event)
  if (!step) return
  event.preventDefault()
  const key = stepRows.value[i]?.key
  reorder(i, i + step)
  await nextTick()
  stepList.value?.querySelector<HTMLButtonElement>(`[data-handle="${key}"]`)?.focus()
}
function remove(i: number) {
  stepRows.value.splice(i, 1)
}
function toggleDay(d: number) {
  const has = weekdays.value.includes(d)
  if (has && weekdays.value.length === 1) return
  weekdays.value = has ? weekdays.value.filter((x) => x !== d) : [...weekdays.value, d].sort()
}

function save() {
  if (!props.routine || !title.value.trim()) return
  void tags.save(props.routine.id)
  emit(
    'save',
    {
      ...props.routine,
      title: title.value.trim(),
      // A run-anytime routine has no weekdays and no reminder (SPEC §5 Routines).
      notify_time: anytime.value ? null : notifyTime.value || null,
      weekdays: anytime.value ? null : weekdays.value,
      week_interval: weekInterval.value,
    },
    stepRows.value.map((s) => ({ id: s.id, title: s.habitId ? (habitById(s.habitId)?.title ?? s.title) : s.title, habitId: s.habitId ?? null })),
  )
}
function confirmDelete() {
  if (props.routine) emit('delete', props.routine)
  confirmDialog.value?.close()
}

const small = 'min-h-11 min-w-11 rounded-xl border border-line px-2 text-sm disabled:opacity-40'
</script>
