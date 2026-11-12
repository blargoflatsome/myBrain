<template>
  <dialog
    ref="dialog"
    :aria-label="heading"
    class="m-auto max-h-[92dvh] w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-bg p-5 text-ink backdrop:bg-black/60"
  >
    <form class="flex flex-col gap-3" @submit.prevent="confirm">
      <h2 class="text-xl font-bold">{{ heading }}</h2>
      <slot />
      <label :class="fieldLabel">
        {{ typeLabel }}
        <input v-model="typed" :class="field" autocomplete="off" autocapitalize="characters" spellcheck="false">
      </label>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <div class="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          class="min-h-12 flex-1 rounded-xl px-4 font-semibold disabled:opacity-50"
          :class="tone === 'warning' ? 'bg-warning text-warning-ink' : 'bg-danger text-danger-ink'"
          :disabled="busy || !ready || !matches"
        >
          {{ confirmLabel }}
        </button>
        <button type="button" class="flex-1" :class="secondaryButton" @click="close">{{ keepLabel }}</button>
      </div>
    </form>
    <CloseX @click="close" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §2 Confirm before impact: the window that asks me to type a word (DELETE) before something that can't be
// undone, such as Delete my data (orange) and Delete My Account (red). What it removes goes in the slot.
import CloseX from '@/components/CloseX.vue'
import { computed, ref } from 'vue'
import { field, fieldLabel, secondaryButton } from '@/ui/styles'

const props = withDefaults(
  defineProps<{
    heading: string
    word: string
    typeLabel: string
    confirmLabel: string
    keepLabel: string
    tone?: 'danger' | 'warning'
    busy?: boolean
    /** False while something else the window asks for is missing (nothing ticked). */
    ready?: boolean
    error?: string
  }>(),
  { tone: 'danger', busy: false, ready: true, error: '' },
)
const emit = defineEmits<{ confirm: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const typed = ref('')
const matches = computed(() => typed.value.trim().toUpperCase() === props.word)

function confirm() {
  if (matches.value && props.ready) emit('confirm')
}
function open() {
  typed.value = ''
  dialog.value?.showModal()
}
function close() {
  dialog.value?.close()
}
defineExpose({ open, close })
</script>
