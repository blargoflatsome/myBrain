<template>
  <section class="flex flex-col gap-4 rounded-xl border border-line p-4" aria-labelledby="my-people-settings" data-testid="my-people-settings">
    <h3 id="my-people-settings" class="font-semibold">{{ m.heading }}</h3>
    <p class="text-sm text-muted">{{ m.hint }}</p>
    <div>
      <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="startAdd">{{ m.add }}</button>
    </div>
    <p class="text-sm text-muted" role="status" data-testid="people-notice">{{ notice }}</p>
    <p v-if="!people.length" class="text-muted">{{ m.empty }}</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="p in pageItems" :key="p.id" class="flex min-w-0 items-center justify-between gap-2" data-testid="saved-person">
        <span class="min-w-0 text-sm [overflow-wrap:anywhere]">
          <span class="font-medium">{{ personLabel(p) }}</span>
          <span v-if="p.name" class="text-muted"> · {{ p.email || p.phone }}</span>
        </span>
        <span class="flex shrink-0 flex-wrap justify-end gap-1">
          <button v-if="withAccounts.has(p.id)" type="button" class="min-h-11 rounded-xl border border-accent px-3 text-sm" :aria-label="c.connectPersonLabel(personLabel(p))" @click="connect(p)">{{ c.connectPerson }}</button>
          <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" :aria-label="m.editLabel(personLabel(p))" @click="startEdit(p)">{{ m.edit }}</button>
          <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm text-danger" :aria-label="m.removeLabel(personLabel(p))" @click="askRemove(p)">{{ m.remove }}</button>
        </span>
      </li>
    </ul>
    <PageControls v-model:page="page" :page-count="pageCount" :label="m.heading" />

    <dialog ref="editor" :class="dialogBox" :aria-label="adding ? m.addHeading : m.editHeading" @close="editing = null">
      <form v-if="editing" class="flex flex-col gap-3 p-5" novalidate @submit.prevent="saveEdit">
        <h3 class="text-lg font-semibold">{{ adding ? m.addHeading : m.editHeading }}</h3>
        <label class="flex flex-col gap-1 text-sm text-muted">{{ m.name }}<input v-model="name" maxlength="120" :class="field" autocomplete="off"></label>
        <label class="flex flex-col gap-1 text-sm text-muted">{{ m.email }}<input v-model="email" type="email" maxlength="320" :class="field" autocomplete="off"></label>
        <label class="flex flex-col gap-1 text-sm text-muted">{{ m.phone }}<input v-model="phone" type="tel" maxlength="40" :class="field" autocomplete="off"></label>
        <p v-if="error" class="text-sm text-danger" role="alert" data-testid="person-error">{{ error }}</p>
        <div class="flex gap-2">
          <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.save }}</button>
          <button type="button" :class="secondaryButton" @click="editor?.close()">{{ m.cancel }}</button>
        </div>
      </form>
      <CloseX @click="editor?.close()" />
    </dialog>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Calendar, my people: on the Account page I can fix a saved person's name, email or phone, or remove them.
import CloseX from '@/components/CloseX.vue'
import { computed, onMounted, ref } from 'vue'
import { useUndoStore } from '@/stores/undo'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { contactKey, isEmail, isPhone } from '@/events/contacts'
import { personLabel, sortPeople } from '@/events/people'
import { peopleWithAccounts, requestConnection } from '@/connections/connections'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { live } from '@/sync/live'
import type { PersonRow } from '@/sync/types'
import { dialogBox, field, secondaryButton } from '@/ui/styles'

const m = messages.myPeople
const c = messages.connections
const brain = useBrainStore()
const rows = useLiveQuery<PersonRow[]>(async () => (brain.db ? live(await brain.db.people.toArray()) : []), [], [() => brain.db])
const people = computed(() => sortPeople(rows.value))
const { page, pageCount, pageItems } = usePagination(people, 10)

const editor = ref<HTMLDialogElement | null>(null)
const editing = ref<PersonRow | null>(null)
const name = ref('')
const email = ref('')
const phone = ref('')
const error = ref('')
// Adding uses the same form as editing, starting empty (SPEC §5 Calendar, my people).
const adding = ref(false)
const notice = ref('')
function startAdd() {
  startEdit({ id: crypto.randomUUID(), user_id: brain.userId ?? undefined, name: null, email: null, phone: null, deleted_at: null })
  adding.value = true
}
function startEdit(p: PersonRow) {
  adding.value = false
  notice.value = ''
  editing.value = p
  name.value = p.name ?? ''
  email.value = p.email ?? ''
  phone.value = p.phone ?? ''
  error.value = ''
  editor.value?.showModal()
}
async function saveEdit() {
  if (!editing.value) return
  const e = email.value.trim().toLowerCase()
  const ph = phone.value.trim()
  if (e && !isEmail(e)) return (error.value = m.badEmail)
  if (ph && !isPhone(ph)) return (error.value = m.badPhone)
  if (!e && !ph) return (error.value = m.needOne)
  const row = { ...editing.value, name: name.value.trim() || null, email: e || null, phone: ph || null }
  // Someone else already saved with this email or phone: say so instead of saving them twice.
  const key = contactKey(row)
  const twin = rows.value.find((p) => p.id !== row.id && contactKey(p) === key)
  if (twin) return (error.value = m.alreadySaved(personLabel(twin)))
  await brain.savePerson(row)
  if (adding.value) notice.value = m.addedNotice(personLabel(row))
  editor.value?.close()
}

// Saved people who have accounts show Connect (SPEC §10 Connections).
const withAccounts = ref<Set<string>>(new Set())
async function loadAccounts() {
  if (brain.online) withAccounts.value = await peopleWithAccounts().catch(() => new Set<string>())
}
onMounted(loadAccounts)
async function connect(p: PersonRow) {
  if (!p.email) return
  await requestConnection(p.email)
  notice.value = c.requestSent(personLabel(p))
  await loadAccounts()
}

// Removing someone happens straight away, with Undo (SPEC §2).
const undo = useUndoStore()
async function askRemove(p: PersonRow) {
  await brain.removePerson(p.id)
  undo.offer(messages.undo.removed(personLabel(p)), () => brain.restore('people', p.id))
}
</script>
