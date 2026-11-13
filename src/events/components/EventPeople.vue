<template>
  <MoreOptions :title="m.people" :summary="m.attendeesSummary(invited.length, goingCount)" :start-open="invited.length + pending.length > 0" test-id="event-people">
    <p class="text-xs text-muted">{{ m.peopleHint }} {{ m.limit }}</p>

    <ul v-if="invited.length" class="flex flex-col gap-1" :aria-label="m.invited">
      <li v-for="p in invited" :key="p.invite_id" class="flex items-center justify-between gap-2 text-sm" data-testid="invited-person">
        <span class="min-w-0 [overflow-wrap:anywhere]">
          {{ p.name || p.email || p.phone }}
          <PersonStatus v-if="p.user_id" :status="statuses.get(p.user_id)" />
        </span>
        <span class="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <OptionalToggle v-if="p.user_id" :name="p.name || ''" :model-value="!!p.optional" @update:model-value="setOptional(p, $event)" />
          <span class="text-muted">{{ m.responses[p.response] }}</span>
          <button v-if="p.email || p.phone" type="button" class="min-h-9 rounded-lg px-2 text-sm underline" :aria-label="c.newLinkLabel(p.name || p.email || p.phone || '')" @click="newLink(p)">{{ c.newLink }}</button>
          <button type="button" class="size-9 rounded-lg text-muted" :aria-label="m.remove(p.name || p.email || p.phone || '')" @click="remove(p)">✕</button>
        </span>
      </li>
    </ul>

    <div v-if="fresh" class="flex flex-col gap-2 rounded-xl bg-bg p-3 text-sm" role="status" data-testid="new-guest-link">
      <span>{{ c.newLinkReady(fresh.name) }}</span>
      <span class="[overflow-wrap:anywhere]">{{ fresh.link }}</span>
      <a v-if="fresh.href" :href="fresh.href" class="min-h-11 self-start rounded-xl border border-line px-4 py-2.5">{{ c.sendNewLink }}</a>
    </div>

    <h3 v-if="pending.length" id="people-to-invite" class="text-sm font-medium">{{ m.toInvite }}</h3>
    <ul v-if="pending.length" class="flex flex-col gap-1" aria-labelledby="people-to-invite">
      <li v-for="(p, i) in pending" :key="keyOf(p) ?? i" class="flex items-center justify-between gap-2 text-sm" data-testid="pending-person">
        <span class="min-w-0 [overflow-wrap:anywhere]">
          {{ personLabel(p) }}
          <PersonStatus v-if="p.user_id" :status="statuses.get(p.user_id)" />
        </span>
        <span class="flex shrink-0 items-center gap-1">
          <OptionalToggle v-if="p.user_id" :name="personLabel(p)" :model-value="!!p.optional" @update:model-value="setPendingOptional(i, $event)" />
          <button type="button" class="size-9 shrink-0 rounded-lg text-muted" :aria-label="m.remove(personLabel(p))" @click="drop(i)">✕</button>
        </span>
      </li>
    </ul>

    <button type="button" :class="[smallButton, 'self-start font-medium']" data-testid="open-contacts" @click="contacts?.open()">
      {{ m.contacts }}
    </button>

    <div class="flex flex-col gap-2" role="group" aria-labelledby="type-someone">
      <span id="type-someone" class="pb-2 text-sm font-medium">{{ m.typeSomeone }}</span>
      <div class="grid grid-cols-2 gap-2">
        <label :class="fieldLabel"><span class="pb-2">{{ m.contact }}</span><input v-model="contact" :class="fieldCompact" autocomplete="off" @keydown.enter.prevent="addContact"></label>
        <label :class="fieldLabel"><span class="pb-2">{{ m.contactName }}</span><input v-model="contactName" :class="fieldCompact" autocomplete="off" @keydown.enter.prevent="addContact"></label>
      </div>
      <button type="button" :class="[smallButton, 'self-start']" @click="addContact">{{ m.addContact }}</button>
    </div>
    <p v-if="contactError" class="text-sm text-danger" role="alert" data-testid="people-error">{{ contactError }}</p>
    <p class="text-sm text-muted" role="status" data-testid="people-status">{{ status }}</p>

    <slot />

    <ContactsDialog ref="contacts" :pending="pending" :invited="invited" @add="addSaved" @undo="undoSaved" @add-connection="addConnection" @undo-connection="undoConnection" />
  </MoreOptions>
</template>

<script setup lang="ts">
// SPEC §5 Shared events and invitations: invite people by typing an email or phone number, or from my people (the
// Contacts window); see who's invited and their answers.
import { computed, ref, watch } from 'vue'
import ContactsDialog from '@/events/components/ContactsDialog.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import { contactKey, parseContact } from '@/events/contacts'
import { personLabel } from '@/events/people'
import { newInviteLink, type Connection } from '@/connections/connections'
import OptionalToggle from '@/events/components/OptionalToggle.vue'
import PersonStatus from '@/events/components/PersonStatus.vue'
import { eventPeople, inviteLink, setInviteOptional, shareHref, uninvite, type EventPerson, type PersonToInvite } from '@/events/sharing'
import type { Status } from '@/events/availability'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import type { PersonRow } from '@/sync/types'
import { fieldCompact, fieldLabel, smallButton } from '@/ui/styles'

const props = defineProps<{
  eventId: string
  isNew: boolean
  modelValue: PersonToInvite[]
  /** SPEC §10 Scheduler: each connection's status for the chosen time, by user id. */
  statuses: Map<string, Status>
}>()
const emit = defineEmits<{ 'update:modelValue': [PersonToInvite[]]; invited: [EventPerson[]] }>()
const m = messages.invites
const c = messages.connections
const brain = useBrainStore()

// ---------- Already invited (from the server; names and answers) ----------
const invited = ref<EventPerson[]>([])
async function loadInvited() {
  if (props.isNew || !brain.online) return
  invited.value = await eventPeople(props.eventId).catch(() => [])
}
watch(invited, (list) => emit('invited', list))
// SPEC §10 Scheduler: optional people don't hold up a suggested time; saved on the invitation straight away.
async function setOptional(p: EventPerson, value: boolean) {
  invited.value = invited.value.map((x) => (x.invite_id === p.invite_id ? { ...x, optional: value } : x))
  await setInviteOptional(p.invite_id, value).catch(() => loadInvited())
}
function setPendingOptional(i: number, value: boolean) {
  emit('update:modelValue', pending.value.map((x, j) => (j === i ? { ...x, optional: value } : x)))
}
watch(() => props.eventId, loadInvited, { immediate: true })
async function remove(p: EventPerson) {
  await uninvite(p.invite_id)
  await loadInvited()
  await brain.refresh(['event_invites'])
}

// A guest whose link was forwarded or lost gets a new one; the old one stops working (SPEC §10 Connections).
const fresh = ref<{ name: string; link: string; href: string | null } | null>(null)
async function newLink(p: EventPerson) {
  const token = await newInviteLink(p.invite_id)
  const link = inviteLink(p.invite_id, token)
  const body = c.newLinkBody(link)
  fresh.value = { name: p.name || p.email || p.phone || '', link, href: shareHref({ email: p.email, phone: p.phone, subject: body, body }) }
}

// ---------- Adding people ----------
const pending = computed(() => props.modelValue)
const goingCount = computed(() => invited.value.filter((p) => p.response === 'yes').length)
const keyOf = (p: PersonToInvite) => (p.user_id ? `u:${p.user_id}` : contactKey(p))
function add(p: PersonToInvite) {
  const key = keyOf(p)
  if (pending.value.some((x) => keyOf(x) === key)) return
  emit('update:modelValue', [...pending.value, p])
}
function drop(i: number) {
  emit('update:modelValue', pending.value.filter((_, j) => j !== i))
}

// What just happened, said out loud and on screen (SPEC §5 Calendar: inviting shows every step).
const status = ref('')
const contact = ref('')
const contactName = ref('')
const contactError = ref('')
function addContact() {
  const parsed = parseContact(contact.value)
  if (!parsed) return (contactError.value = m.contactError)
  contactError.value = ''
  const person = { ...parsed, name: contactName.value.trim() || undefined }
  add(person)
  status.value = m.added(personLabel(person))
  contact.value = ''
  contactName.value = ''
}

// From the Contacts window: Add, and Undo while it's still open.
const contacts = ref<InstanceType<typeof ContactsDialog> | null>(null)
function addSaved(p: PersonRow) {
  add({ name: p.name ?? undefined, email: p.email ?? undefined, phone: p.email ? undefined : (p.phone ?? undefined) })
  status.value = m.added(personLabel(p))
}
function addConnection(f: Connection) {
  add({ user_id: f.friend_id, name: f.display_name })
  status.value = m.added(f.display_name)
}
function undoConnection(f: Connection) {
  emit('update:modelValue', pending.value.filter((x) => x.user_id !== f.friend_id))
  status.value = m.undone(f.display_name)
}
function undoSaved(p: PersonRow) {
  const key = contactKey(p)
  emit('update:modelValue', pending.value.filter((x) => contactKey(x) !== key))
  status.value = m.undone(personLabel(p))
}
</script>
