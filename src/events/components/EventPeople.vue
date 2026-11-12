<template>
  <MoreOptions :title="m.people" :summary="m.attendeesSummary(invited.length, goingCount)" :start-open="invited.length + pending.length > 0" test-id="event-people">
    <p class="text-xs text-muted">{{ m.peopleHint }} {{ m.limit }}</p>

    <ul v-if="invited.length" class="flex flex-col gap-1" :aria-label="m.invited">
      <li v-for="p in invited" :key="p.invite_id" class="flex items-center justify-between gap-2 text-sm" data-testid="invited-person">
        <span class="min-w-0 [overflow-wrap:anywhere]">{{ p.name || p.email || p.phone }}</span>
        <span class="flex shrink-0 items-center gap-1">
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
          <span v-if="p.user_id && slot" :class="conflicts.includes(p) ? 'text-danger' : 'text-accent'" data-testid="person-availability">
            · {{ conflicts.includes(p) ? m.busy : m.free }}
          </span>
        </span>
        <button type="button" class="size-9 shrink-0 rounded-lg text-muted" :aria-label="m.remove(personLabel(p))" @click="drop(i)">✕</button>
      </li>
    </ul>
    <div v-if="suggestions.length" class="flex flex-col gap-1" data-testid="suggested-times">
      <span class="text-xs text-muted">{{ m.everyoneFree }}</span>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="s in suggestions" :key="s.start" type="button" class="min-h-11 rounded-full border border-accent px-3 text-sm" @click="pick(s)">{{ slotLabel(s) }}</button>
      </div>
    </div>

    <button type="button" class="min-h-11 self-start rounded-xl border border-line px-4 text-sm font-medium" data-testid="open-contacts" @click="contacts?.open()">
      {{ m.contacts }}
    </button>

    <div class="flex flex-col gap-2" role="group" aria-labelledby="type-someone">
      <span id="type-someone" class="pb-2 text-sm font-medium">{{ m.typeSomeone }}</span>
      <div class="grid grid-cols-2 gap-2">
        <label :class="fieldLabel"><span class="pb-2">{{ m.contact }}</span><input v-model="contact" :class="fieldCompact" autocomplete="off" @keydown.enter.prevent="addContact"></label>
        <label :class="fieldLabel"><span class="pb-2">{{ m.contactName }}</span><input v-model="contactName" :class="fieldCompact" autocomplete="off" @keydown.enter.prevent="addContact"></label>
      </div>
      <button type="button" class="min-h-11 self-start rounded-xl border border-line px-4 text-sm" @click="addContact">{{ m.addContact }}</button>
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
import { eventPeople, freeBusy, inviteLink, shareHref, uninvite, type EventPerson, type PersonToInvite } from '@/events/sharing'
import { busyTimes, hasConflict, suggestTimes, type Interval } from '@/events/availability'
import { zonedTime } from '@/habits/rules'
import { addDays, deviceTimeZone, todayIn } from '@/tasks/days'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import type { PersonRow } from '@/sync/types'
import { fieldCompact, fieldLabel } from '@/ui/styles'

const props = defineProps<{
  eventId: string
  isNew: boolean
  startDate: string
  startTime: string | null
  endDate: string
  endTime: string | null
  modelValue: PersonToInvite[]
}>()
const emit = defineEmits<{ 'update:modelValue': [PersonToInvite[]]; suggest: [{ date: string; start: string; end: string }] }>()
const m = messages.invites
const c = messages.connections
const brain = useBrainStore()

// ---------- Already invited (from the server; names and answers) ----------
const invited = ref<EventPerson[]>([])
async function loadInvited() {
  if (props.isNew || !brain.online) return
  invited.value = await eventPeople(props.eventId).catch(() => [])
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
// ---------- Availability: connections only (SPEC §10 Connections: scheduling) ----------
const checkIds = computed(() => pending.value.filter((p) => p.user_id).map((p) => p.user_id!))
const busy = ref<Map<string, Interval[]>>(new Map())
const tz = deviceTimeZone()
watch(
  checkIds,
  async (ids) => {
    if (!ids.length || !brain.online) return (busy.value = new Map())
    const from = todayIn(tz)
    const rows = await freeBusy([...ids, ...(brain.userId ? [brain.userId] : [])]).catch(() => [])
    busy.value = busyTimes(rows, from, addDays(from, 14))
  },
  { immediate: true },
)
const slot = computed<Interval | null>(() => {
  if (!props.startTime || !props.endTime) return null
  return { start: zonedTime(props.startDate, props.startTime.slice(0, 5), tz), end: zonedTime(props.endDate, props.endTime.slice(0, 5), tz) }
})
const conflicts = computed(() => (slot.value ? pending.value.filter((p) => p.user_id && hasConflict(busy.value.get(p.user_id), slot.value!)) : []))
const suggestions = computed(() => {
  if (!slot.value || !conflicts.value.length) return []
  return suggestTimes(busy.value, slot.value.end - slot.value.start, new Date(), tz)
})
function pick(s: Interval) {
  const date = todayIn(tz, new Date(s.start))
  const fmt = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
  emit('suggest', { date, start: fmt(s.start), end: fmt(s.end) })
}
const slotLabel = (s: Interval) =>
  new Date(s.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz })
</script>
