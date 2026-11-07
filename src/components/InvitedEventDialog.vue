<script setup lang="ts">
// SPEC §5 Shared events: an event I was invited to. Read-only; I answer Yes / Maybe / No, message the host or
// everyone going, or drop out (cancel and notify).
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messageEvent, respondToInvite, whenText } from '@/events/sharing'
import { messages } from '@/messages'
import type { EventInviteRow, EventRow } from '@/sync/types'

const props = defineProps<{ event: EventRow | null; invite: EventInviteRow | null }>()
const emit = defineEmits<{ close: []; dropOut: [EventRow] }>()
const m = messages.invites
const brain = useBrainStore()

const dialog = ref<HTMLDialogElement | null>(null)
const audience = ref<'host' | 'everyone'>('host')
const text = ref('')
const notice = ref('')
const error = ref('')
const answer = ref(props.invite?.response ?? 'pending')

watch(
  () => props.event,
  (e) => {
    if (!e) return dialog.value?.close()
    answer.value = props.invite?.response ?? 'pending'
    text.value = ''
    notice.value = ''
    error.value = ''
    dialog.value?.showModal()
  },
)
const cancelled = computed(() => !!props.event?.cancelled_at)
const dropped = computed(() => answer.value === 'dropped')

async function respond(a: 'yes' | 'maybe' | 'no') {
  if (!props.invite) return
  error.value = ''
  try {
    await respondToInvite(props.invite.id, a)
    answer.value = a
    await brain.refresh(['event_invites'])
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
async function send() {
  if (!props.event || !text.value.trim()) return
  error.value = ''
  try {
    await messageEvent(props.event.id, audience.value, text.value)
    text.value = ''
    notice.value = m.sent
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
const btn = (on: boolean) => ['min-h-11 flex-1 rounded-xl border px-3 font-semibold', on ? 'border-accent bg-accent text-accent-ink' : 'border-line']
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto max-h-[92dvh] w-[min(100%-2rem,30rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/40"
    :aria-label="event?.title ?? ''"
    data-testid="invited-event"
    @close="emit('close')"
  >
    <div v-if="event" class="flex flex-col gap-4">
      <div>
        <p class="text-sm text-muted">{{ m.from(invite?.host_name || '') }}</p>
        <h2 class="text-xl font-bold" :class="cancelled ? 'line-through' : ''">{{ event.title }}</h2>
        <p>{{ whenText(event) }}</p>
        <p v-if="event.notes" class="mt-1 text-sm whitespace-pre-wrap text-muted">{{ event.notes }}</p>
      </div>
      <p v-if="cancelled" class="rounded-xl bg-bg p-3 text-sm" role="status">{{ m.cancelledNote }}</p>
      <template v-else-if="!dropped">
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{{ answer === 'pending' ? m.pendingLabel : m.answer }}</span>
          <div class="flex gap-2" role="group" :aria-label="m.answer">
            <button type="button" :class="btn(answer === 'yes')" :aria-pressed="answer === 'yes'" @click="respond('yes')">{{ m.yes }}</button>
            <button type="button" :class="btn(answer === 'maybe')" :aria-pressed="answer === 'maybe'" @click="respond('maybe')">{{ m.maybe }}</button>
            <button type="button" :class="btn(answer === 'no')" :aria-pressed="answer === 'no'" @click="respond('no')">{{ m.no }}</button>
          </div>
        </div>
        <form class="flex flex-col gap-2" @submit.prevent="send">
          <span class="text-sm font-medium">{{ m.message }}</span>
          <div class="flex gap-2 text-sm" role="radiogroup" :aria-label="m.message">
            <label class="flex items-center gap-1"><input v-model="audience" type="radio" value="host" class="accent-[var(--accent)]">{{ m.messageHost }}</label>
            <label class="flex items-center gap-1"><input v-model="audience" type="radio" value="everyone" class="accent-[var(--accent)]">{{ m.messageEveryone }}</label>
          </div>
          <textarea v-model="text" rows="2" maxlength="2000" class="rounded-xl border border-line bg-bg px-3 py-2 text-base" :placeholder="m.messagePlaceholder" :aria-label="m.messagePlaceholder" />
          <button type="submit" class="min-h-11 self-start rounded-xl border border-line px-4">{{ m.send }}</button>
          <p v-if="notice" class="text-sm" role="status">{{ notice }}</p>
        </form>
        <button v-if="answer === 'yes' || answer === 'maybe'" type="button" class="min-h-11 self-start rounded-xl border border-danger px-4 text-sm font-semibold text-danger" @click="emit('dropOut', event)">
          {{ m.dropOut }}
        </button>
      </template>
      <p class="text-xs text-muted">{{ m.readOnly }}</p>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <button type="button" class="min-h-11 rounded-xl border border-line px-4" @click="dialog?.close()">{{ messages.calendar.editor.close }}</button>
    </div>
  </dialog>
</template>
