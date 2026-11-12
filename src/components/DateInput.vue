<template>
  <div class="relative flex flex-col gap-1">
    <label :for="id" :class="labelClass">{{ label }}</label>
    <input
      v-if="touch"
      :id="id"
      type="date"
      :value="modelValue ?? ''"
      :data-value="modelValue ?? ''"
      :min="min"
      :required="required"
      :aria-label="ariaLabel"
      :class="inputClass"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <template v-else>
      <input
        :id="id"
        type="text"
        role="combobox"
        autocomplete="off"
        :value="text"
        :data-value="modelValue ?? ''"
        :data-min="min"
        :required="required"
        :aria-label="ariaLabel"
        aria-haspopup="grid"
        :aria-expanded="open"
        :aria-controls="gridId"
        :aria-activedescendant="open && active ? cellId(active) : undefined"
        :aria-describedby="hint ? `${id}-hint` : undefined"
        :placeholder="m.placeholder"
        :class="inputClass"
        data-testid="date-input"
        @input="onInput"
        @click="open ? (open = false) : showGrid()"
        @keydown="onKeydown"
        @blur="commit"
      >
      <span v-if="hint" :id="`${id}-hint`" class="text-xs text-muted">{{ hint }}</span>
      <div
        v-show="open"
        class="absolute top-full left-0 z-20 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-control bg-surface p-2 text-ink shadow-lg"
        data-testid="date-grid"
        @mousedown.prevent
      >
        <div class="mb-1 flex items-center justify-between">
          <button type="button" tabindex="-1" class="flex size-10 items-center justify-center rounded-lg hover:bg-bg" :aria-label="m.previousMonth" @click="moveMonth(-1)">‹</button>
          <span class="text-sm font-semibold" aria-live="polite">{{ monthTitle }}</span>
          <button type="button" tabindex="-1" class="flex size-10 items-center justify-center rounded-lg hover:bg-bg" :aria-label="m.nextMonth" @click="moveMonth(1)">›</button>
        </div>
        <table :id="gridId" role="grid" :aria-label="monthTitle" class="w-full table-fixed border-collapse text-center text-sm">
          <thead>
            <tr>
              <th v-for="d in weekdayShort" :key="d" scope="col" class="pb-1 text-xs font-normal text-muted">{{ d }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="week in weeks" :key="week[0]">
              <td
                v-for="day in week"
                :id="cellId(day)"
                :key="day"
                role="gridcell"
                :aria-selected="day === modelValue"
                :aria-disabled="disabled(day) || undefined"
                :aria-label="dayLabel(day)"
                class="p-0.5"
              >
                <span
                  class="flex h-9 cursor-pointer items-center justify-center rounded-lg"
                  :class="[
                    day === active ? 'bg-accent text-accent-ink' : day === modelValue ? 'border border-accent font-semibold' : 'hover:bg-bg',
                    day.slice(0, 7) !== viewMonth ? 'text-muted' : '',
                    disabled(day) ? 'cursor-not-allowed line-through opacity-50' : '',
                    day === today && day !== active ? 'underline' : '',
                  ]"
                  @click="choose(day)"
                  @mousemove="active = day"
                >{{ Number(day.slice(8)) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="mt-1 flex justify-between text-sm">
          <button type="button" tabindex="-1" class="min-h-10 rounded-lg px-2 hover:bg-bg" @click="choose(today)">{{ m.today }}</button>
          <button v-if="!required && modelValue" type="button" tabindex="-1" class="min-h-10 rounded-lg px-2 text-muted hover:bg-bg" @click="clear">{{ m.clear }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Date fields, the partner of the time fields. On a computer: type a day ("tomorrow", "Fri", "Nov 20",
// "11/20") or pick it from a month grid (an accessible combobox with a grid: arrows move by day and week, Page Up and
// Page Down by month, Enter picks, Escape closes just the grid). On a phone or tablet: the device's own date picker.
import { computed, onScopeDispose, ref, useId, watch } from 'vue'
import { addMonths, monthGrid } from '@/time/months'
import { dateReader, loadDateReader } from '@/time/typedDate'
import { readIsoDate } from '@/time/isoDate'
import { addDays, deviceTimeZone, todayIn } from '@/tasks/days'
import { dayLabel } from '@/ui/dates'
import { messages } from '@/messages'

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined
    label: string
    ariaLabel?: string
    required?: boolean
    min?: string
    hint?: string
    labelClass?: string
    inputClass?: string
  }>(),
  { ariaLabel: undefined, required: false, min: undefined, hint: undefined, labelClass: 'pb-2 text-sm text-muted', inputClass: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const m = messages.dateInput
const weekdayShort = messages.habits.weekdayNames.map((d) => d.slice(0, 2))

const id = useId()
const gridId = `${id}-grid`
const cellId = (day: string) => `${id}-d-${day}`

const coarseQuery = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null
const touch = ref(!!coarseQuery?.matches)
const onPointerChange = (e: MediaQueryListEvent) => (touch.value = e.matches)
coarseQuery?.addEventListener('change', onPointerChange)
onScopeDispose(() => coarseQuery?.removeEventListener('change', onPointerChange))
// Ready before anything is typed: the typed box is the only one that reads typed days.
watch(touch, (t) => !t && void loadDateReader(), { immediate: true })

const today = todayIn(deviceTimeZone())
const shown = (v: string | null | undefined) => (v ? dayLabel(v, today) : '')
const text = ref(shown(props.modelValue))
const typing = ref(false)
watch(
  () => props.modelValue,
  (v) => {
    if (!typing.value) text.value = shown(v)
  },
)

const open = ref(false)
const active = ref<string | null>(null)
const viewMonth = computed(() => (active.value ?? props.modelValue ?? today).slice(0, 7))
const weeks = computed(() => monthGrid(`${viewMonth.value}-01`))
const monthTitle = computed(() => {
  const [y, mo] = viewMonth.value.split('-').map(Number)
  return new Date(Date.UTC(y!, mo! - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
})
const disabled = (day: string) => !!props.min && day < props.min

function showGrid() {
  open.value = true
  active.value = props.modelValue || (props.min && props.min > today ? props.min : today)
}
function onInput(event: Event) {
  typing.value = true
  text.value = (event.target as HTMLInputElement).value
  if (!text.value.trim()) {
    if (!props.required) emit('update:modelValue', '')
    return
  }
  const typed = text.value
  // A full date (pasted, filled in by the browser) is used straight away, so a Save right after it never misses it.
  const exact = readIsoDate(typed)
  if (exact) return useTyped(exact)
  const read = dateReader()
  if (read) return useTyped(read(typed, today))
  // Still loading (typed at once): read it when it's here, unless something else was typed by then.
  void loadDateReader().then((r) => text.value === typed && useTyped(r(typed, today)))
}
function useTyped(day: string | null) {
  if (day && !disabled(day)) {
    emit('update:modelValue', day)
    if (open.value) active.value = day
  }
}
async function commit() {
  if (!dateReader()) await loadDateReader()
  typing.value = false
  open.value = false
  // Whatever was typed settles to the saved day, shown the app's way; something that isn't a day goes back.
  text.value = shown(props.modelValue)
}
function choose(day: string) {
  if (disabled(day)) return
  emit('update:modelValue', day)
  typing.value = false
  text.value = shown(day)
  open.value = false
}
function clear() {
  emit('update:modelValue', '')
  text.value = ''
  open.value = false
}
function moveMonth(by: number) {
  active.value = addMonths(active.value ?? props.modelValue ?? today, by)
}
const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
function onKeydown(event: KeyboardEvent) {
  if (!open.value) {
    if (event.key === 'ArrowDown' || (event.key === 'ArrowUp' && event.altKey)) {
      event.preventDefault()
      showGrid()
    }
    return
  }
  if (event.key in MOVES) {
    event.preventDefault()
    active.value = addDays(active.value ?? today, MOVES[event.key]!)
  } else if (event.key === 'PageDown' || event.key === 'PageUp') {
    event.preventDefault()
    moveMonth(event.key === 'PageDown' ? 1 : -1)
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    const week = weeks.value.find((w) => w.includes(active.value ?? ''))
    if (week) active.value = event.key === 'Home' ? week[0]! : week[6]!
  } else if (event.key === 'Enter' && active.value) {
    event.preventDefault()
    choose(active.value)
  } else if (event.key === 'Escape') {
    // Close the grid only, not the window it sits in.
    event.preventDefault()
    event.stopPropagation()
    open.value = false
  }
}
</script>
