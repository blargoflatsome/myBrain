<template>
  <section class="flex flex-col gap-3 rounded-xl border border-line px-4 py-3" :aria-labelledby="`${uid}-title`" data-testid="journal-lock">
    <div class="flex items-center gap-2">
      <AppIcon name="lock" size="size-5" />
      <h3 :id="`${uid}-title`" class="font-semibold">{{ m.title }}</h3>
    </div>
    <p class="text-sm text-muted">{{ state.on ? m.hintOn : m.hintOff }}</p>
    <p v-if="state.on && state.unlocked && state.pending > 0" class="text-sm" role="status" data-testid="journal-locking">{{ m.locking(state.pending) }}</p>

    <button v-if="!state.on" type="button" :class="[primaryButtonSmall, 'self-start']" data-testid="journal-lock-on" @click="lockDialog?.open('setup')">
      {{ m.turnOn }}
    </button>

    <template v-else>
      <div class="flex flex-wrap gap-2">
        <button type="button" :class="smallButton" data-testid="journal-change-passphrase" @click="lockDialog?.open('passphrase')">{{ m.changePassphrase }}</button>
        <button type="button" :class="smallButton" data-testid="journal-new-recovery" @click="lockDialog?.open('recovery')">{{ m.newRecovery }}</button>
        <button v-if="canAddPasskey" type="button" :class="smallButton" data-testid="journal-add-passkey" @click="lockDialog?.open('passkey')">{{ m.addPasskey }}</button>
      </div>

      <div class="flex flex-col gap-1">
        <h4 class="text-sm font-semibold">{{ m.passkeysHeading }}</h4>
        <p v-if="!state.passkeys.length" class="text-sm text-muted">{{ m.noPasskeys }}</p>
        <ul v-else class="flex flex-col" data-testid="journal-passkeys">
          <li v-for="p in state.passkeys" :key="p.id" class="flex items-center justify-between gap-2">
            <span class="min-w-0">
              <span class="block [overflow-wrap:anywhere]">{{ p.name }}</span>
              <span v-if="p.created_at" class="block text-xs text-muted">{{ m.added(dayLabel(p.created_at.slice(0, 10))) }}</span>
            </span>
            <RowDelete :label="m.removePasskey(p.name)" @click="removePasskey(p)" />
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="button" :class="warningOutline" data-testid="journal-lock-off" @click="lockDialog?.open('off')">{{ m.turnOff }}</button>
        <button type="button" :class="warningOutline" data-testid="journal-start-over" @click="confirmStartOver?.open()">{{ m.startOver }}</button>
      </div>
    </template>

    <JournalLockDialog ref="lockDialog" />
    <TypeToConfirmDialog
      ref="confirmStartOver"
      :heading="m.startOverHeading"
      :word="m.word"
      :type-label="m.typeLabel"
      :confirm-label="m.startOverConfirm"
      :keep-label="m.keep"
      tone="warning"
      @confirm="startOver"
    >
      <p>{{ m.startOverBody }}</p>
    </TypeToConfirmDialog>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Locking my journal: the Account page's Your data card. Turn the lock on; once on, change the passphrase,
// get a new recovery key, add or remove passkeys, turn it off, or start the journal over.
import { computed, ref, useId } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import RowDelete from '@/components/RowDelete.vue'
import TypeToConfirmDialog from '@/components/TypeToConfirmDialog.vue'
import JournalLockDialog from '@/journal/components/JournalLockDialog.vue'
import { useJournalLock } from '@/journal/useJournalLock'
import { passkeysSupported } from '@/journal/passkeys'
import { useBrainStore } from '@/stores/brain'
import { useUndoStore } from '@/stores/undo'
import type { JournalPasskeyRow } from '@/sync/types'
import { dayLabel } from '@/ui/dates'
import { messages } from '@/messages'
import { primaryButtonSmall, smallButton, warningOutline } from '@/ui/styles'

const m = messages.journalLock
const uid = useId()
const brain = useBrainStore()
const undo = useUndoStore()
const { state } = useJournalLock()
const canAddPasskey = computed(() => passkeysSupported())
const lockDialog = ref<InstanceType<typeof JournalLockDialog> | null>(null)
const confirmStartOver = ref<InstanceType<typeof TypeToConfirmDialog> | null>(null)

async function removePasskey(p: JournalPasskeyRow) {
  await brain.removeJournalPasskey(p.id)
  undo.offer(messages.undo.removed(p.name), () => brain.restore('journal_passkeys', p.id))
}

function startOver() {
  confirmStartOver.value?.close()
  lockDialog.value?.open('startOver')
}
</script>
