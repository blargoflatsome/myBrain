<template>
  <fieldset class="flex flex-col gap-3 rounded-xl border border-line p-3" data-testid="event-people">
    <legend class="px-1 text-sm font-medium">{{ m.people }}</legend>
    <p class="-mt-1 text-xs text-muted">{{ m.peopleHint }} {{ m.limit }}</p>

    <ul v-if="invited.length" class="flex flex-col gap-1" :aria-label="m.invited">
      <li v-for="p in invited" :key="p.invite_id" class="flex items-center justify-between gap-2 text-sm" data-testid="invited-person">
        <span class="truncate">{{ p.name || p.email || p.phone }}</span>
        <span class="flex shrink-0 items-center gap-1">
          <span class="text-muted">{{ m.responses[p.response] }}</span>
          <button type="button" class="size-9 rounded-lg text-muted" :aria-label="m.remove(p.name || p.email || p.phone || '')" @click="remove(p)">✕</button>
        </span>
      </li>
    </ul>

    <h3 v-if="pending.length" id="people-to-invite" class="text-sm font-medium">{{ m.toInvite }}</h3>
    <ul v-if="pending.length" class="flex flex-col gap-1" aria-labelledby="people-to-invite">
      <li v-for="(p, i) in pending" :key="p.user_id ?? p.email ?? p.phone" class="flex items-center justify-between gap-2 text-sm" data-testid="pending-person">
        <span class="truncate">
          {{ p.name || p.email || p.phone }}
          <span v-if="p.user_id && slot" :class="conflicts.includes(p) ? 'text-danger' : 'text-accent'" data-testid="person-availability">
            · {{ conflicts.includes(p) ? m.busy : m.free }}
          </span>
        </span>
        <button type="button" class="size-9 rounded-lg text-muted" :aria-label="m.remove(p.name || p.email || p.phone || '')" @click="drop(i)">✕</button>
      </li>
    </ul>
    <div v-if="suggestions.length" class="flex flex-col gap-1" data-testid="suggested-times">
      <span class="text-xs text-muted">{{ m.everyoneFree }}</span>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="s in suggestions" :key="s.start" type="button" class="min-h-9 rounded-full border border-accent px-3 text-sm" @click="pick(s)">{{ slotLabel(s) }}</button>
      </div>
    </div>

    <label class="flex flex-col gap-1 text-sm text-muted">
      {{ m.search }}
      <input v-model="query" :class="fieldCompact" autocomplete="off" :placeholder="m.searchHint">
    </label>
    <ul v-if="found.length" class="flex flex-col gap-1">
      <li v-for="p in found" :key="p.user_id">
        <button type="button" class="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left hover:bg-bg" @click="addFound(p)">
          <img v-if="p.avatar_url" :src="p.avatar_url" alt="" class="size-7 rounded-full" referrerpolicy="no-referrer">
          <span>{{ m.addFound(p.display_name || '') }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="searched" class="text-xs text-muted">{{ m.noMatches }}</p>

    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1 text-sm text-muted">{{ m.contact }}<input v-model="contact" :class="fieldCompact" autocomplete="off" @keydown.enter.prevent="addContact"></label>
      <label class="flex flex-col gap-1 text-sm text-muted">{{ m.contactName }}<input v-model="contactName" :class="fieldCompact" autocomplete="off" @keydown.enter.prevent="addContact"></label>
    </div>
    <p v-if="contactError" class="text-sm text-danger" role="alert">{{ contactError }}</p>
    <p class="text-sm text-muted" role="status" data-testid="people-status">{{ status }}</p>
    <div class="flex flex-wrap gap-2">
      <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="addContact">{{ m.addContact }}</button>
      <button v-if="canPickContacts()" type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="fromContacts">{{ m.pickContacts }}</button>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
// SPEC §5 Shared events and Availability: invite people by name, email, phone or from my contacts; see who's
// invited and their answers; for people found by name, see who is free and get suggested times.
import { computed, ref, watch } from 'vue'
import { canPickContacts, eventPeople, freeBusy, pickContacts, searchPeople, uninvite, type EventPerson, type FoundPerson, type PersonToInvite } from '@/events/sharing'
import { busyTimes, hasConflict, suggestTimes, type Interval } from '@/events/availability'
import { parseContact } from '@/events/contacts'
import { zonedTime } from '@/habits/rules'
import { addDays, deviceTimeZone, todayIn } from '@/tasks/days'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import { fieldCompact } from '@/ui/styles'

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

// ---------- Adding people ----------
const pending = computed(() => props.modelValue)
function add(p: PersonToInvite) {
  const key = (x: PersonToInvite) => x.user_id ?? x.email ?? x.phone
  if (pending.value.some((x) => key(x) === key(p))) return
  emit('update:modelValue', [...pending.value, p])
}
function drop(i: number) {
  emit('update:modelValue', pending.value.filter((_, j) => j !== i))
}

const query = ref('')
const found = ref<FoundPerson[]>([])
const searched = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(searchTimer)
  searched.value = false
  if (q.trim().length < 3) return (found.value = [])
  searchTimer = setTimeout(async () => {
    found.value = await searchPeople(q.trim()).catch(() => [])
    searched.value = true
  }, 300)
})
function addFound(p: FoundPerson) {
  status.value = m.added(p.display_name || '')
  add({ user_id: p.user_id, name: p.display_name ?? undefined })
  query.value = ''
  found.value = []
}

const contact = ref('')
const contactName = ref('')
const contactError = ref('')
// What just happened, said out loud and on screen (SPEC §5 Calendar: inviting shows every step).
const status = ref('')
const nameOf = (p: PersonToInvite) => p.name || p.email || p.phone || ''
function addContact() {
  const parsed = parseContact(contact.value)
  if (!parsed) return (contactError.value = m.contactError)
  contactError.value = ''
  const person = { ...parsed, name: contactName.value.trim() || undefined }
  add(person)
  status.value = m.added(nameOf(person))
  contact.value = ''
  contactName.value = ''
}
async function fromContacts() {
  contactError.value = ''
  let picked: Awaited<ReturnType<typeof pickContacts>>
  try {
    picked = await pickContacts()
  } catch {
    contactError.value = m.contactsFailed
    return
  }
  if (!picked.people.length) {
    if (picked.skipped) contactError.value = m.noUsableContacts
    return
  }
  for (const p of picked.people) add(p)
  status.value = picked.people.length === 1 && !picked.skipped ? m.added(nameOf(picked.people[0]!)) : m.addedSome(picked.people.length, picked.skipped)
}

// ---------- Availability: only people found by name (never reveals who has an account) ----------
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
