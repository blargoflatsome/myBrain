<template>
  <dialog
    ref="dialog"
    :aria-labelledby="`${uid}-heading`"
    class="m-auto max-h-[92dvh] w-[min(28rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-bg p-5 text-ink backdrop:bg-black/60"
    data-testid="journal-lock-dialog"
    @close="reset"
  >
    <div v-if="action" class="flex flex-col gap-4">
      <h2 :id="`${uid}-heading`" class="pr-10 text-xl font-bold">{{ heading }}</h2>

      <template v-if="step === 'prove'">
        <p class="text-sm text-muted">{{ m.proveIntro }}</p>
        <UnlockForm purpose="prove" :submit-label="m.next" @proved="onProved" />
      </template>

      <form v-else-if="step === 'passphrase'" class="flex flex-col gap-4" @submit.prevent="savePassphrase">
        <template v-if="action !== 'passphrase'">
          <p class="text-sm">{{ m.setupIntro }}</p>
          <p class="text-sm font-semibold">{{ m.setupWarning }}</p>
        </template>
        <PassphraseFields v-model:passphrase="passphrase" v-model:repeat="repeat" :problem="shownProblem" />
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <button type="submit" :class="[primaryButton, 'self-start']" :disabled="busy" data-testid="passphrase-next">
          {{ busy ? m.working : action === 'passphrase' ? m.changePassphrase : m.next }}
        </button>
      </form>

      <template v-else-if="step === 'recovery'">
        <RecoveryKeyShow v-model:saved="savedRecovery" :recovery-key="recoveryKey" />
        <p v-if="action !== 'recovery'" class="text-xs text-muted">{{ m.oldCopies }}</p>
        <button type="button" :class="[primaryButton, 'self-start']" :disabled="!savedRecovery" data-testid="recovery-next" @click="afterRecovery">
          {{ offerPasskey ? m.next : m.done }}
        </button>
      </template>

      <form v-else-if="step === 'passkey'" class="flex flex-col gap-4" @submit.prevent="addPasskey">
        <p class="text-sm">{{ m.passkeyIntro }}</p>
        <label :class="fieldLabel">
          {{ m.passkeyName }}
          <input v-model="passkeyName" maxlength="120" :class="field" data-testid="passkey-name">
        </label>
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
        <div class="flex flex-wrap gap-2">
          <button type="submit" :class="primaryButton" :disabled="busy || !passkeyName.trim()" data-testid="passkey-add">{{ busy ? m.working : m.addPasskey }}</button>
          <button type="button" :class="secondaryButton" @click="close">{{ action === 'passkey' ? m.close : m.skip }}</button>
        </div>
      </form>

      <template v-else-if="step === 'off'">
        <p>{{ m.turnOffBody }}</p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button type="button" :class="[warningButton, 'flex-1']" :disabled="busy" data-testid="turn-off-confirm" @click="turnOff">{{ m.turnOff }}</button>
          <button type="button" :class="[secondaryButton, 'flex-1']" @click="close">{{ m.keep }}</button>
        </div>
      </template>

      <template v-else-if="step === 'done'">
        <p role="status">{{ doneNote }}</p>
        <button type="button" :class="[primaryButton, 'self-start']" @click="close">{{ m.done }}</button>
      </template>
    </div>
    <CloseX :label="m.close" @click="close" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Locking my journal: every lock flow in one window. Turning it on and starting over choose a passphrase,
// show the recovery key once, then offer a passkey. Changes to an existing lock first ask me to show it's me.
import { computed, ref, useId } from 'vue'
import CloseX from '@/components/CloseX.vue'
import PassphraseFields from '@/journal/components/PassphraseFields.vue'
import RecoveryKeyShow from '@/journal/components/RecoveryKeyShow.vue'
import UnlockForm from '@/journal/components/UnlockForm.vue'
import { useBrainStore } from '@/stores/brain'
import { useProfileStore } from '@/stores/profile'
import type { JournalKeyBytes, LockAction } from '@/journal/lockActions'
import { passphraseProblem } from '@/journal/lockRules'
import { NoPrfError, passkeysSupported } from '@/journal/passkeys'
import { messages } from '@/messages'
import { field, fieldLabel, primaryButton, secondaryButton, warningButton } from '@/ui/styles'

type Step = 'prove' | 'passphrase' | 'recovery' | 'passkey' | 'off' | 'done'

const m = messages.journalLock
const uid = useId()
const brain = useBrainStore()
const profile = useProfileStore()
const dialog = ref<HTMLDialogElement | null>(null)
const action = ref<LockAction | null>(null)
const step = ref<Step>('passphrase')
const passphrase = ref('')
const repeat = ref('')
const tried = ref(false)
const busy = ref(false)
const error = ref('')
const recoveryKey = ref('')
const savedRecovery = ref(false)
const passkeyName = ref(m.passkeyNameDefault)
const doneNote = ref('')
// Held in memory only while this window is open, for the change I'm making.
let raw: JournalKeyBytes | null = null

const offerPasskey = computed(() => (action.value === 'setup' || action.value === 'startOver') && passkeysSupported())
const problem = computed(() => passphraseProblem(passphrase.value, repeat.value))
// Shown once I've tried to go on, not while I'm still typing.
const shownProblem = computed(() => (tried.value ? problem.value : null))
const heading = computed(() => {
  switch (action.value) {
    case 'passphrase':
      return step.value === 'prove' ? m.proveHeading : m.newPassphraseHeading
    case 'recovery':
      return step.value === 'prove' ? m.proveHeading : m.recoveryHeading
    case 'passkey':
      return step.value === 'prove' ? m.proveHeading : m.addPasskey
    case 'off':
      return step.value === 'prove' ? m.proveHeading : m.turnOff
    case 'startOver':
      return step.value === 'recovery' ? m.recoveryHeading : step.value === 'passkey' ? m.passkeyHeading : m.startOver
    default:
      return step.value === 'recovery' ? m.recoveryHeading : step.value === 'passkey' ? m.passkeyHeading : m.title
  }
})

function open(next: LockAction) {
  reset()
  action.value = next
  step.value = next === 'setup' || next === 'startOver' ? 'passphrase' : 'prove'
  dialog.value?.showModal()
}
function close() {
  dialog.value?.close()
}
function reset() {
  raw = null
  action.value = null
  passphrase.value = ''
  repeat.value = ''
  tried.value = false
  busy.value = false
  error.value = ''
  recoveryKey.value = ''
  savedRecovery.value = false
  passkeyName.value = m.passkeyNameDefault
  doneNote.value = ''
}

async function onProved(key: JournalKeyBytes) {
  raw = key
  if (action.value === 'passphrase') step.value = 'passphrase'
  else if (action.value === 'passkey') step.value = 'passkey'
  else if (action.value === 'off') step.value = 'off'
  else if (action.value === 'recovery') {
    recoveryKey.value = await brain.newJournalRecoveryKey(key)
    step.value = 'recovery'
  }
}

async function savePassphrase() {
  tried.value = true
  if (problem.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (action.value === 'passphrase') {
      await brain.changeJournalPassphrase(raw!, passphrase.value)
      finish(m.passphraseChanged)
    } else {
      const made = action.value === 'startOver' ? await brain.startJournalOver(passphrase.value) : await brain.lockJournal(passphrase.value)
      raw = made.raw
      recoveryKey.value = made.recoveryKey
      step.value = 'recovery'
    }
  } catch {
    error.value = m.failed
  } finally {
    busy.value = false
    passphrase.value = ''
    repeat.value = ''
    tried.value = false
  }
}

function afterRecovery() {
  if (offerPasskey.value) step.value = 'passkey'
  else if (action.value === 'recovery') close()
  else finish(m.lockedDone)
}

async function addPasskey() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await brain.addJournalPasskey(raw!, passkeyName.value, m.passkeyAccount(profile.shown?.display_name || m.passkeySite), m.passkeySite)
    finish(m.passkeyAdded)
  } catch (err) {
    if (err instanceof NoPrfError) error.value = m.noPrf
    else if ((err as { name?: string })?.name !== 'NotAllowedError') error.value = m.passkeyFailed
  } finally {
    busy.value = false
  }
}

async function turnOff() {
  busy.value = true
  await brain.unlockJournalForGood(raw!)
  busy.value = false
  close()
}

function finish(note: string) {
  raw = null
  doneNote.value = note
  step.value = 'done'
}

defineExpose({ open })
</script>
