<template>
  <div class="flex flex-col gap-3">
    <label :class="fieldLabel">
      {{ m.passphrase }}
      <input
        v-model="passphrase"
        :type="shown ? 'text' : 'password'"
        autocomplete="new-password"
        minlength="12"
        maxlength="500"
        :class="field"
        :aria-describedby="`${uid}-hint ${problem ? `${uid}-problem` : ''}`"
        :aria-invalid="!!problem"
        data-testid="new-passphrase"
      >
      <span :id="`${uid}-hint`" class="text-xs">{{ m.passphraseHint }}</span>
    </label>
    <label :class="fieldLabel">
      {{ m.repeat }}
      <input
        v-model="repeat"
        :type="shown ? 'text' : 'password'"
        autocomplete="new-password"
        maxlength="500"
        :class="field"
        :aria-describedby="`${uid}-match ${problem ? `${uid}-problem` : ''}`"
        :aria-invalid="problem === 'mismatch'"
        data-testid="repeat-passphrase"
      >
      <!-- Says as I type whether the two match, in words and a mark, not colour alone (WCAG 1.4.1). -->
      <span :id="`${uid}-match`" class="min-h-5 text-xs" aria-live="polite" data-testid="passphrase-match" :data-match="match ?? undefined">
        <template v-if="match === true">✓ {{ m.matches }}</template>
        <template v-else-if="match === false">✗ {{ m.noMatchYet }}</template>
      </span>
    </label>
    <label class="flex min-h-11 items-center gap-3 self-start">
      <input v-model="shown" type="checkbox" :class="checkbox" data-testid="show-passphrase">
      <span>{{ m.showPassphrase }}</span>
    </label>
    <p v-if="problem" :id="`${uid}-problem`" class="text-sm text-danger" role="alert">{{ problem === 'short' ? m.tooShort : m.mismatch }}</p>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Locking my journal: a new passphrase, typed twice (it says as I type whether they match), with a Show
// passphrase checkbox. Paste is allowed and the fields say "new-password", so password managers offer to save it.
import { computed, ref, useId } from 'vue'
import { messages } from '@/messages'
import { checkbox, field, fieldLabel } from '@/ui/styles'

defineProps<{ problem: 'short' | 'mismatch' | null }>()
const passphrase = defineModel<string>('passphrase', { required: true })
const repeat = defineModel<string>('repeat', { required: true })
const m = messages.journalLock
const uid = useId()
const shown = ref(false)
// Nothing until I start typing the repeat.
const match = computed(() => (repeat.value ? repeat.value === passphrase.value : null))
</script>
