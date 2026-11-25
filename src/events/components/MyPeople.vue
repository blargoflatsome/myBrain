<template>
  <section class="flex flex-col gap-4 rounded-xl border border-line p-4" aria-labelledby="my-people-settings" data-testid="my-people-settings">
    <h3 id="my-people-settings" class="font-semibold">{{ m.heading }}</h3>
    <p class="text-sm text-muted">{{ m.hint }}</p>
    <div>
      <button type="button" :class="smallButton" @click="startAdd">{{ m.add }}</button>
    </div>
    <p class="text-sm text-muted" role="status" data-testid="people-notice">{{ notice }}</p>
    <p v-if="!people.length" class="text-muted">{{ m.empty }}</p>
    <ul v-if="peopleShown.length" class="flex flex-col gap-2">
      <template v-for="{ key, row: p, line } in peopleShown" :key="key">
        <UndoLine v-if="line" :line="line" in-box class="!pl-0" @undo="(el) => undoable.run(line, el)" />
        <li v-else-if="p" class="flex min-w-0 items-center justify-between gap-2" data-testid="saved-person">
          <button type="button" class="min-h-11 min-w-0 flex-1 text-left text-sm [overflow-wrap:anywhere]" :aria-label="m.editLabel(shownAs(p))" @click="startEdit(p)">
            <span class="font-medium">{{ personLabel(p) }}</span>
            <span v-if="p.name" class="text-muted"> · {{ p.email || p.phone }}</span>
          </button>
          <span class="flex shrink-0 flex-wrap justify-end gap-1">
            <button v-if="withAccounts.has(p.id)" type="button" class="min-h-11 rounded-xl border border-accent px-3 text-sm" :aria-label="c.connectPersonLabel(personLabel(p))" @click="connect(p)">{{ c.connectPerson }}</button>
            <RowDelete :label="m.removeLabel(personLabel(p))" @click="askRemove(p)" />
          </span>
        </li>
      </template>
    </ul>
    <PageControls v-model:page="page" :page-count="pageCount" :label="m.heading" />

    <dialog ref="editor" :class="dialogBox" :aria-label="adding ? m.addHeading : m.editHeading" @close="editing = null">
      <form v-if="editing" class="flex flex-col gap-3 p-5" novalidate @submit.prevent="saveEdit">
        <h3 class="text-lg font-semibold">{{ adding ? m.addHeading : m.editHeading }}</h3>
        <label :class="fieldLabel">{{ m.name }}<input v-model="name" maxlength="120" :class="field" autocomplete="off"></label>
        <label :class="fieldLabel">{{ m.email }}<input v-model="email" v-field-error="emailError" type="email" maxlength="320" :class="field" autocomplete="off"></label>
        <FieldError :of="emailError" data-testid="person-error" />
        <label :class="fieldLabel">{{ m.phone }}<input v-model="phone" v-field-error="phoneError" type="tel" maxlength="40" :class="field" autocomplete="off"></label>
        <FieldError :of="phoneError" data-testid="person-error" />
        <div class="flex gap-2">
          <button type="submit" class="flex-1" :class="primaryButton">{{ m.save }}</button>
          <button type="button" :class="secondaryButton" @click="editor?.close()">{{ m.cancel }}</button>
        </div>
      </form>
      <CloseX @click="editor?.close()" />
    </dialog>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Calendar, my people: on the Account page I can fix a saved person's name, email or phone, or remove them.
import { useRows } from '@/sync/useRows'
import RowDelete from '@/components/RowDelete.vue'
import CloseX from '@/components/CloseX.vue'
import FieldError from '@/components/FieldError.vue'
import { useFieldError, vFieldError } from '@/composables/useFieldError'
import { computed, ref } from 'vue'
import { useServerList } from '@/server/useServerList'
import UndoLine from '@/components/UndoLine.vue'
import { useUndoInPlace } from '@/composables/useUndoInPlace'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { isEmail, isPhone } from '@/events/contacts'
import { personLabel, shownAs, sortPeople } from '@/events/people'
import { peopleWithAccounts, requestConnection } from '@/connections/connections'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import type { PersonRow } from '@/sync/types'
import { dialogBox, field, fieldLabel, primaryButton, secondaryButton, smallButton } from '@/ui/styles'

const m = messages.myPeople
const c = messages.connections
const brain = useBrainStore()
const rows = useRows('people')
const people = computed(() => sortPeople(rows.value))
const { page, pageCount, pageItems } = usePagination(people, 10)

const editor = ref<HTMLDialogElement | null>(null)
const editing = ref<PersonRow | null>(null)
const name = ref('')
const email = ref('')
const phone = ref('')
// SPEC §5 Forms: why Save was refused, beside the box it's about.
const emailError = useFieldError()
const phoneError = useFieldError()
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
  emailError.clear()
  phoneError.clear()
  editor.value?.showModal()
}
async function saveEdit() {
  if (!editing.value) return
  // A box refused last time may be fine now: only this Save's answer shows.
  emailError.clear()
  phoneError.clear()
  const e = email.value.trim().toLowerCase()
  const ph = phone.value.trim()
  if (e && !isEmail(e)) return emailError.refuse(m.badEmail)
  if (ph && !isPhone(ph)) return phoneError.refuse(m.badPhone)
  if (!e && !ph) return emailError.refuse(m.needOne)
  // Someone else already saved with this email or phone: say so instead of saving them twice.
  const result = await brain.savePerson({ ...editing.value, name: name.value, email: e, phone: ph })
  // The box they match on is the one to change: the email whenever one is typed (contactKey).
  if ('twin' in result) return (e ? emailError : phoneError).refuse(m.alreadySaved(personLabel(result.twin)))
  if (adding.value) notice.value = m.addedNotice(personLabel(result.saved))
  editor.value?.close()
}

// Saved people who have accounts show Connect (SPEC §10 Connections).
// Loaded when online and again on coming back (SPEC §7). If it can't load, Connect just doesn't show: the people
// themselves are on this device.
const accounts = useServerList(peopleWithAccounts, new Set<string>())
const withAccounts = accounts.value
const loadAccounts = accounts.reload
async function connect(p: PersonRow) {
  if (!p.email) return
  await requestConnection(p.email)
  notice.value = c.requestSent(personLabel(p))
  await loadAccounts()
}

// Removing someone happens straight away, with Undo in place (SPEC §2).
const undoable = useUndoInPlace()
const peopleShown = computed(() => undoable.placed(pageItems.value))
async function askRemove(p: PersonRow) {
  const place = { row: { id: p.id, in: pageItems.value } }
  undoable.offer(messages.undo.removed(personLabel(p)), await brain.removePerson(p.id), place)
}
</script>
