<template>
  <dialog ref="dialog" :class="dialogBox" :aria-label="m.inviteHeading(name)" data-testid="invite-to-event">
    <div class="flex flex-col gap-4 p-5">
      <h2 class="pr-10 text-lg font-semibold [overflow-wrap:anywhere]">{{ m.inviteHeading(name) }}</h2>
      <form v-if="choices.length" class="flex flex-col gap-3" novalidate @submit.prevent="send">
        <label :class="fieldLabel">
          {{ m.pickEvent }}
          <select v-model="picked" :class="field" data-testid="invite-event-choice">
            <option v-for="c in choices" :key="c.event.id" :value="c.event.id" :disabled="c.state !== 'open'">
              {{ optionText(c) }}
            </option>
          </select>
        </label>
        <button type="submit" :class="[primaryButton, 'self-start']" :disabled="!picked || sending">{{ m.send }}</button>
      </form>
      <p v-else class="text-sm text-muted">{{ m.noEvents }}</p>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <p class="text-sm text-muted" role="status" data-testid="invite-status">{{ status }}</p>
      <div class="flex flex-col gap-2 border-t border-line pt-4">
        <span class="text-sm text-muted">{{ m.orNew }}</span>
        <button type="button" :class="[secondaryButton, 'self-start']" @click="startNew">{{ m.newEvent }}</button>
      </div>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Profiles, Invite to event: invite a connection to one of my upcoming events, or start a new event with
// them already added.
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CloseX from '@/components/CloseX.vue'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { startEventWith } from '@/events/startWith'
import { invitePeople } from '@/events/sharing'
import { inviteChoices, type InviteChoice } from '@/profiles/rules'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import type { EventInviteRow, EventRow } from '@/sync/types'
import { dayTimeLabel } from '@/ui/dates'
import { dialogBox, field, fieldLabel, primaryButton, secondaryButton } from '@/ui/styles'

const props = defineProps<{ friendId: string; name: string; invitedEvents: string[] }>()
const emit = defineEmits<{ invited: [eventId: string] }>()
const m = messages.personProfile
const brain = useBrainStore()
const router = useRouter()
const { today } = useToday()

const events = useLiveQuery<EventRow[]>(async () => (brain.db ? brain.db.events.toArray() : []), [], [() => brain.db])
const invites = useLiveQuery<EventInviteRow[]>(async () => (brain.db ? brain.db.event_invites.toArray() : []), [], [() => brain.db])
const choices = computed(() => inviteChoices(events.value, invites.value, new Set(props.invitedEvents), brain.userId ?? '', today.value))
const picked = ref('')
// The soonest event they can be invited to is chosen, also when my events arrive after the window opened.
watch(choices, (list) => {
  if (!list.some((c) => c.event.id === picked.value && c.state === 'open')) picked.value = list.find((c) => c.state === 'open')?.event.id ?? ''
})

function optionText(c: InviteChoice) {
  const base = `${c.event.title} · ${dayTimeLabel(c.next, c.event.start_time)}`
  return c.state === 'invited' ? `${base} · ${m.invited}` : c.state === 'full' ? `${base} · ${m.full}` : base
}

const dialog = ref<HTMLDialogElement | null>(null)
const sending = ref(false)
const status = ref('')
const error = ref('')
async function send() {
  const choice = choices.value.find((c) => c.event.id === picked.value && c.state === 'open')
  if (!choice) return
  sending.value = true
  error.value = ''
  try {
    await invitePeople(choice.event.id, [{ user_id: props.friendId, name: props.name }])
    status.value = m.sent(props.name, choice.event.title)
    emit('invited', choice.event.id)
    await brain.refresh(['event_invites'])
  } catch {
    error.value = m.failed
  } finally {
    sending.value = false
  }
}

function startNew() {
  startEventWith({ user_id: props.friendId, name: props.name })
  dialog.value?.close()
  void router.push('/calendar')
}

defineExpose({
  open: () => {
    status.value = ''
    error.value = ''
    picked.value = choices.value.find((c) => c.state === 'open')?.event.id ?? ''
    dialog.value?.showModal()
  },
})
</script>
