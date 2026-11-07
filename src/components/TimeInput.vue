<script setup lang="ts">
// SPEC §5 Time fields. On a computer: type a time ("8", "830", "6pm") or pick from a list every 15 minutes, like
// Google Calendar (an accessible combobox). On a phone or tablet: the device's own time picker.
import { computed, nextTick, onScopeDispose, ref, useId, watch } from 'vue'
import { formatTime, nearestQuarter, parseTime, QUARTER_HOURS } from '@/time/parse'
import { messages } from '@/messages'

const props = withDefaults(
  defineProps<{
    modelValue: string | null | undefined
    label: string
    /** A fuller name for screen readers when the visible label is short (for example "Starts Time"). */
    ariaLabel?: string
    required?: boolean
    labelClass?: string
    inputClass?: string
  }>(),
  { ariaLabel: undefined, required: false, labelClass: 'text-sm text-muted', inputClass: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const id = useId()
const listId = `${id}-list`

// Touch devices keep their own picker, which is easy to use with a finger.
const coarseQuery = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null
const touch = ref(!!coarseQuery?.matches)
const onPointerChange = (e: MediaQueryListEvent) => (touch.value = e.matches)
coarseQuery?.addEventListener('change', onPointerChange)
onScopeDispose(() => coarseQuery?.removeEventListener('change', onPointerChange))

const value = computed(() => (props.modelValue ? props.modelValue.slice(0, 5) : ''))
const text = ref(value.value ? formatTime(value.value) : '')
const typing = ref(false)
watch(value, (v) => {
  if (!typing.value) text.value = v ? formatTime(v) : ''
})

const open = ref(false)
const active = ref<string | null>(null)
const list = ref<HTMLUListElement | null>(null)
const optionId = (t: string) => `${id}-opt-${t.replace(':', '')}`

async function showList(at?: string | null) {
  open.value = true
  active.value = at ?? nearestQuarter(value.value)
  await nextTick()
  scrollToActive()
}
function scrollToActive() {
  if (!list.value || !active.value) return
  const el = list.value.querySelector<HTMLElement>(`#${CSS.escape(optionId(active.value))}`)
  if (el) list.value.scrollTop = el.offsetTop - list.value.clientHeight / 2 + el.clientHeight / 2
}

function onInput(event: Event) {
  typing.value = true
  text.value = (event.target as HTMLInputElement).value
  if (!text.value.trim()) {
    emit('update:modelValue', '')
    return
  }
  const parsed = parseTime(text.value)
  if (parsed) {
    emit('update:modelValue', parsed)
    // Typing never opens the list (it would cover the fields below); if it's already open, it follows along.
    if (open.value) {
      active.value = nearestQuarter(parsed)
      void nextTick(scrollToActive)
    }
  }
}
function commit() {
  typing.value = false
  open.value = false
  // Whatever was typed settles to the saved time, shown the device's way; something that isn't a time goes back.
  text.value = value.value ? formatTime(value.value) : ''
}
function choose(t: string) {
  emit('update:modelValue', t)
  typing.value = false
  text.value = formatTime(t)
  open.value = false
}
function step(by: number) {
  const at = QUARTER_HOURS.indexOf(active.value ?? nearestQuarter(value.value))
  active.value = QUARTER_HOURS[(at + by + QUARTER_HOURS.length) % QUARTER_HOURS.length]!
  void nextTick(scrollToActive)
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) void showList()
    else step(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'PageDown' || event.key === 'PageUp') {
    if (!open.value) return
    event.preventDefault()
    step(event.key === 'PageDown' ? 4 : -4)
  } else if (event.key === 'Enter' && open.value && active.value) {
    event.preventDefault()
    choose(active.value)
  } else if (event.key === 'Escape' && open.value) {
    // Close the list only, not the window it sits in.
    event.preventDefault()
    event.stopPropagation()
    open.value = false
  }
}
</script>

<template>
  <div class="relative flex flex-col gap-1">
    <label :for="id" :class="labelClass">{{ label }}</label>
    <input
      v-if="touch"
      :id="id"
      type="time"
      :value="value"
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
        inputmode="numeric"
        autocomplete="off"
        :value="text"
        :required="required"
        :aria-label="ariaLabel"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="open && active ? optionId(active) : undefined"
        :placeholder="messages.timeInput.placeholder"
        :class="inputClass"
        @input="onInput"
        @click="open ? (open = false) : showList()"
        @keydown="onKeydown"
        @blur="commit"
      >
      <ul
        v-show="open"
        :id="listId"
        ref="list"
        role="listbox"
        :aria-label="messages.timeInput.listLabel"
        class="absolute top-full right-0 left-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-control bg-surface p-1 text-base text-ink shadow-lg"
        @mousedown.prevent
      >
        <li
          v-for="t in QUARTER_HOURS"
          :id="optionId(t)"
          :key="t"
          role="option"
          :aria-selected="t === value"
          class="flex min-h-10 cursor-pointer items-center rounded-lg px-3"
          :class="[t === active ? 'bg-accent text-accent-ink' : 'hover:bg-bg', t === value && t !== active ? 'font-semibold' : '']"
          @click="choose(t)"
          @mousemove="active = t"
        >
          {{ formatTime(t) }}
        </li>
      </ul>
    </template>
  </div>
</template>
