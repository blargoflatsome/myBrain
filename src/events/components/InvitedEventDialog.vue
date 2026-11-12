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
        <p>{{ dayTimeLabel(event.start_date, event.start_time) }}</p>
        <RichNotes :value="event.notes" class="mt-1 text-sm text-muted" />
      </div>
      <p v-if="cancelled" class="rounded-xl bg-bg p-3 text-sm" role="status">{{ m.cancelledNote }}</p>
      <template v-else-if="!dropped">
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{{ answer === 'pending' ? m.pendingLabel : m.answer }}</span>
          <div class="flex gap-2" role="group" :aria-label="m.answer">
            <button type="button" :class="choice(answer === 'yes')" :aria-pressed="answer === 'yes'" @click="respond('yes')">{{ m.yes }}</button>
            <button type="button" :class="choice(answer === 'maybe')" :aria-pressed="answer === 'maybe'" @click="respond('maybe')">{{ m.maybe }}</button>
            <button type="button" :class="choice(answer === 'no')" :aria-pressed="answer === 'no'" @click="respond('no')">{{ m.no }}</button>
          </div>
        </div>
        <section v-if="attendees.length" class="flex flex-col gap-2" aria-labelledby="whos-going" data-testid="whos-going">
          <h3 id="whos-going" class="text-sm font-medium">{{ c.whosGoing }}</h3>
          <ul class="flex flex-col gap-1">
            <li v-for="(a, i) in attendees" :key="a.user_id ?? `guest-${i}`" class="flex min-w-0 items-center justify-between gap-2 text-sm" data-testid="attendee">
              <span class="min-w-0 [overflow-wrap:anywhere]">{{ a.display_name }}<span v-if="a.is_host" class="text-muted"> · {{ c.host }}</span></span>
              <button v-if="a.user_id && a.can_connect" type="button" class="min-h-11 shrink-0 rounded-xl border border-accent px-3" :aria-label="c.connectPersonLabel(a.display_name)" @click="connectTo(a)">{{ c.connectPerson }}</button>
              <span v-else-if="a.connected" class="shrink-0 text-muted">{{ c.connected }}</span>
            </li>
          </ul>
          <p class="text-sm text-muted" role="status" data-testid="attendee-status">{{ attendeeStatus }}</p>
        </section>
        <label class="flex items-center justify-between gap-4 text-sm">
          <span><span class="font-medium">{{ c.showMe }}</span><span class="block text-xs text-muted">{{ c.showMeHint }}</span></span>
          <input v-model="showMe" type="checkbox" :class="checkbox" @change="saveShowMe">
        </label>
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
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Shared events: an event I was invited to. Read-only; I answer Yes / Maybe / No, message the host or
// everyone going, or drop out (cancel and notify).
import CloseX from '@/components/CloseX.vue'
import RichNotes from '@/components/RichNotes.vue'
import { dayTimeLabel } from '@/ui/dates'
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messageEvent, respondToInvite } from '@/events/sharing'
import { connectViaEvent, eventAttendees, setEventVisibility, type Attendee } from '@/connections/connections'
import { messages } from '@/messages'
import type { EventInviteRow, EventRow } from '@/sync/types'
import { checkbox, choice } from '@/ui/styles'

const props = defineProps<{ event: EventRow | null; invite: EventInviteRow | null }>()
const emit = defineEmits<{ close: []; dropOut: [EventRow] }>()
const m = messages.invites
const c = messages.connections
const brain = useBrainStore()

const dialog = ref<HTMLDialogElement | null>(null)
const audience = ref<'host' | 'everyone'>('host')
const text = ref('')
const notice = ref('')
const error = ref('')
const answer = ref(props.invite?.response ?? 'pending')

watch(
  () => props.invite?.response,
  (r) => {
    if (r) answer.value = r
  },
)
watch(
  () => props.event,
  (e) => {
    if (!e) return dialog.value?.close()
    answer.value = props.invite?.response ?? 'pending'
    text.value = ''
    notice.value = ''
    error.value = ''
    showMe.value = props.invite?.visible ?? true
    attendeeStatus.value = ''
    void loadAttendees()
    dialog.value?.showModal()
  },
)

// Who's going (SPEC §10 Connections): other attendees with Connect, and whether I show to them.
const attendees = ref<Attendee[]>([])
const attendeeStatus = ref('')
const showMe = ref(true)
async function loadAttendees() {
  attendees.value = []
  if (!props.event || !brain.online) return
  attendees.value = await eventAttendees(props.event.id).catch(() => [])
}
async function connectTo(a: Attendee) {
  if (!props.event || !a.user_id) return
  await connectViaEvent(props.event.id, a.user_id)
  attendeeStatus.value = c.requestSent(a.display_name)
  await loadAttendees()
}
async function saveShowMe() {
  if (props.invite) await setEventVisibility(props.invite.id, showMe.value).catch(() => {})
}
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
</script>
