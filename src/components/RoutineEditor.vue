<script setup lang="ts">
// New or edit routine: title, reminder time, weekdays, ordered steps (SPEC §5 Routines). Delete asks first (SPEC §2).
import { nextTick, ref, watch } from 'vue'
import { arrowStep, useDragSort } from '@/composables/useDragSort'
import type { RoutineRow, RoutineStepRow } from '@/sync/types'
import { ALL_WEEKDAYS } from '@/routines/rules'
import { messages } from '@/messages'

const props = defineProps<{ routine: RoutineRow | null; steps: RoutineStepRow[]; isNew?: boolean }>()
const emit = defineEmits<{ save: [RoutineRow, { id?: string; title: string }[]]; delete: [RoutineRow]; close: [] }>()
const m = messages.routines
const dayNames = messages.habits.weekdayNames

const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<HTMLDialogElement | null>(null)
const title = ref('')
const notifyTime = ref('')
const weekdays = ref<number[]>([...ALL_WEEKDAYS])
const stepRows = ref<{ key: string; id?: string; title: string }[]>([])

watch(
  () => props.routine,
  (r) => {
    if (!r) return dialog.value?.close()
    title.value = r.title
    notifyTime.value = r.notify_time?.slice(0, 5) ?? ''
    weekdays.value = [...r.weekdays]
    stepRows.value = props.steps.map((s) => ({ key: s.id, id: s.id, title: s.title }))
    if (!stepRows.value.length) addStep()
    dialog.value?.showModal()
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
  emit(
    'save',
    { ...props.routine, title: title.value.trim(), notify_time: notifyTime.value || null, weekdays: weekdays.value },
    stepRows.value.map((s) => ({ id: s.id, title: s.title })),
  )
}
function confirmDelete() {
  if (props.routine) emit('delete', props.routine)
  confirmDialog.value?.close()
}

const field = 'min-h-12 rounded-xl border border-line bg-bg px-3 text-base text-ink'
const chip = (on: boolean) => [
  'min-h-11 min-w-11 rounded-full border px-2 text-sm',
  on ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-surface text-ink',
]
const small = 'min-h-11 min-w-11 rounded-xl border border-line px-2 text-sm disabled:opacity-40'
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    :aria-label="isNew ? m.editor.newHeading : m.editor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ isNew ? m.editor.newHeading : m.editor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.title }}
        <input v-model="title" required :class="field">
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.notifyTime }}
        <input v-model="notifyTime" type="time" :class="field">
      </label>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm text-muted">{{ m.editor.weekdays }}</legend>
        <div class="flex flex-wrap gap-1.5" role="group" :aria-label="m.editor.weekdays">
          <button v-for="d in ALL_WEEKDAYS" :key="d" type="button" :class="chip(weekdays.includes(d))" :aria-pressed="weekdays.includes(d)" @click="toggleDay(d)">
            {{ dayNames[d] }}
          </button>
        </div>
      </fieldset>
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm text-muted">{{ m.editor.steps }}</legend>
        <p v-if="stepRows.length > 1" class="-mt-1 text-xs text-muted">{{ m.editor.dragHint }}</p>
        <ol ref="stepList" class="flex flex-col gap-2">
          <li v-for="(s, i) in stepRows" :key="s.key" class="flex items-center gap-1.5" data-testid="routine-step-row">
            <button
              type="button"
              class="drag-handle flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-xl text-muted active:cursor-grabbing"
              :aria-label="m.editor.drag(s.title || m.editor.stepLabel(i + 1))"
              :data-handle="s.key"
              @keydown="moveByKey($event, i)"
            >
              ⠿
            </button>
            <input v-model="s.title" :aria-label="m.editor.stepLabel(i + 1)" :placeholder="m.editor.stepLabel(i + 1)" :class="[field, 'min-w-0 flex-1']">
            <button type="button" :class="small" :aria-label="m.editor.removeStep(s.title)" @click="remove(i)">✕</button>
          </li>
        </ol>
        <button type="button" class="min-h-11 self-start rounded-xl border border-dashed border-line px-3 text-sm" @click="addStep">{{ m.editor.addStep }}</button>
      </fieldset>
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button v-if="!isNew" type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.showModal()">{{ m.editor.delete }}</button>
    </form>
  </dialog>

  <dialog
    ref="confirmDialog"
    class="m-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
    role="alertdialog"
    :aria-label="m.confirmDelete.heading"
  >
    <h2 class="text-lg font-semibold">{{ m.confirmDelete.heading }}</h2>
    <p class="mt-2 text-muted">{{ m.confirmDelete.body(routine?.title ?? '') }}</p>
    <div class="mt-4 flex gap-2">
      <button type="button" class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-white" @click="confirmDelete">{{ m.confirmDelete.confirm }}</button>
      <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmDialog?.close()">{{ m.confirmDelete.keep }}</button>
    </div>
  </dialog>
</template>
