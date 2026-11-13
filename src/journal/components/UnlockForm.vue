<template>
  <form class="flex flex-col gap-3" data-testid="unlock-form" @submit.prevent="submit({ kind: useRecovery ? 'recovery' : 'passphrase', secret })">
    <button
      v-if="canUsePasskey"
      type="button"
      :class="[primaryButton, 'flex items-center justify-center gap-2']"
      :disabled="busy || waiting > 0"
      data-testid="unlock-passkey"
      @click="submit({ kind: 'passkey' })"
    >
      <AppIcon name="lock" size="size-5" />{{ m.unlockWithPasskey }}
    </button>
    <label :class="fieldLabel">
      {{ useRecovery ? m.recoveryLabel : m.passphrase }}
      <input
        v-model="secret"
        :type="useRecovery ? 'text' : 'password'"
        :autocomplete="useRecovery ? 'off' : 'current-password'"
        :autocapitalize="useRecovery ? 'characters' : 'off'"
        spellcheck="false"
        maxlength="500"
        :class="field"
        :aria-describedby="error ? `${uid}-error` : undefined"
        :aria-invalid="!!error"
        data-testid="unlock-secret"
      >
    </label>
    <p v-if="waiting > 0" class="text-sm text-danger" role="alert">{{ m.waitFor(waiting) }}</p>
    <p v-else-if="error" :id="`${uid}-error`" class="text-sm text-danger" role="alert">{{ error }}</p>
    <div class="flex flex-wrap items-center gap-3">
      <button type="submit" :class="canUsePasskey ? secondaryButton : primaryButton" :disabled="busy || !secret.trim() || waiting > 0" data-testid="unlock-submit">
        {{ busy ? m.working : submitLabel ?? m.unlock }}
      </button>
      <button type="button" class="min-h-11 text-sm underline underline-offset-4" @click="toggleRecovery">
        {{ useRecovery ? m.usePassphrase : m.useRecovery }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
// SPEC §5 Locking my journal: unlock with a passkey (first, where it can work), my passphrase, or my recovery key.
// "unlock" keeps the key on this device; "prove" only hands the journal key to a change (new passphrase and so on).
import { computed, ref, useId } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { useBrainStore } from '@/stores/brain'
import { useJournalLock } from '@/journal/useJournalLock'
import { passkeysSupported, NoPrfError } from '@/journal/passkeys'
import { WrongSecretError } from '@/journal/crypto'
import type { JournalKeyBytes, JournalProof } from '@/journal/lockActions'
import { waitLeft } from '@/journal/lockRules'
import { useNow } from '@/composables/useNow'
import { messages } from '@/messages'
import { field, fieldLabel, primaryButton, secondaryButton } from '@/ui/styles'

const props = defineProps<{ purpose: 'unlock' | 'prove'; submitLabel?: string }>()
const emit = defineEmits<{ unlocked: []; proved: [raw: JournalKeyBytes] }>()
const m = messages.journalLock
const uid = useId()
const brain = useBrainStore()
const { state } = useJournalLock()
const canUsePasskey = computed(() => state.value.passkeys.length > 0 && passkeysSupported())

const secret = ref('')
const useRecovery = ref(false)
const busy = ref(false)
const error = ref('')
const failures = ref(0)
const lastFailure = ref(0)
const now = useNow(1000)
const waiting = computed(() => Math.ceil(waitLeft(failures.value, lastFailure.value, now.value.getTime()) / 1000))

function toggleRecovery() {
  useRecovery.value = !useRecovery.value
  secret.value = ''
  error.value = ''
}

async function submit(proof: JournalProof) {
  if (busy.value || waiting.value > 0) return
  busy.value = true
  error.value = ''
  try {
    if (props.purpose === 'unlock') {
      await brain.unlockJournal(proof)
      emit('unlocked')
    } else {
      emit('proved', await brain.openJournalKey(proof))
    }
    secret.value = ''
    failures.value = 0
  } catch (err) {
    if (err instanceof WrongSecretError) {
      failures.value++
      now.value = new Date()
      lastFailure.value = now.value.getTime()
      error.value = m.wrong
    } else if (err instanceof NoPrfError) {
      error.value = m.noPrf
    } else if ((err as { name?: string })?.name !== 'NotAllowedError') {
      // NotAllowedError is the passkey window being closed: nothing went wrong.
      error.value = m.passkeyFailed
    }
  } finally {
    busy.value = false
  }
}
</script>
