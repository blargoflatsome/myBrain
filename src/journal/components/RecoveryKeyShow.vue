<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted">{{ m.recoveryIntro }}</p>
    <p
      class="rounded-xl border border-line bg-bg p-3 text-center font-mono text-lg tracking-wider break-all"
      :aria-label="m.recoverySpoken(spoken)"
      data-testid="recovery-key"
    >
      {{ recoveryKey }}
    </p>
    <div class="flex flex-wrap gap-2">
      <button type="button" :class="smallButton" @click="copy">{{ copied ? m.copied : m.copy }}</button>
      <button type="button" :class="smallButton" @click="download">{{ m.download }}</button>
      <button type="button" :class="smallButton" @click="print">{{ m.print }}</button>
    </div>
    <label class="flex min-h-11 items-center gap-3">
      <input v-model="saved" type="checkbox" :class="checkbox" data-testid="saved-recovery">
      <span>{{ m.savedIt }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Locking my journal: the recovery key, shown once, with Copy, Download and Print; read out letter by
// letter for screen readers. I tick that I saved it before going on.
import { computed, ref } from 'vue'
import { messages } from '@/messages'
import { checkbox, smallButton } from '@/ui/styles'

const props = defineProps<{ recoveryKey: string }>()
const saved = defineModel<boolean>('saved', { required: true })
const m = messages.journalLock
const copied = ref(false)
// "K 7 Q M, 4 X P A, …": groups read as letters, not as words.
const spoken = computed(() => props.recoveryKey.split('-').map((g) => g.split('').join(' ')).join(', '))

async function copy() {
  try {
    await navigator.clipboard.writeText(props.recoveryKey)
    copied.value = true
  } catch {
    copied.value = false
  }
}
function fileUrl() {
  return URL.createObjectURL(new Blob([m.recoveryFile(props.recoveryKey)], { type: 'text/plain' }))
}
function download() {
  const a = document.createElement('a')
  a.href = fileUrl()
  a.download = 'my-brain-recovery-key.txt'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
function print() {
  const url = fileUrl()
  const w = window.open(url)
  w?.addEventListener('load', () => w.print())
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
</script>
