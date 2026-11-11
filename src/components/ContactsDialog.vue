<template>
  <dialog ref="dialog" :class="dialogBox" :aria-label="m.heading" data-testid="contacts-dialog" @close="search = ''">
    <div class="flex max-h-[85dvh] flex-col gap-3 p-5">
      <h3 class="text-lg font-semibold">{{ m.heading }}</h3>
      <section v-if="connections.length" class="flex flex-col gap-1" aria-labelledby="contacts-on-my-brain" data-testid="contacts-connections">
        <h4 id="contacts-on-my-brain" class="text-sm font-medium">{{ c.onMyBrain }}</h4>
        <ul class="flex flex-col gap-1">
          <li v-for="f in connections" :key="f.friend_id" class="flex min-w-0 items-center justify-between gap-2" data-testid="contact-connection">
            <span class="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{{ f.display_name }}</span>
            <span v-if="invitedIds.has(f.friend_id)" class="shrink-0 text-sm text-muted">{{ m.invited }}</span>
            <span v-else-if="addedIds.has(f.friend_id)" class="flex shrink-0 items-center gap-1">
              <span class="text-sm text-accent">✓ {{ m.added }}</span>
              <button type="button" class="min-h-11 rounded-xl px-3 text-sm underline" :aria-label="m.undoLabel(f.display_name)" @click="emit('undoConnection', f)">{{ m.undo }}</button>
            </span>
            <button v-else type="button" class="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm" :aria-label="m.addLabel(f.display_name)" @click="emit('addConnection', f)">
              {{ m.add }}
            </button>
          </li>
        </ul>
      </section>
      <template v-if="people.length">
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.search }}
          <input v-model="search" type="search" :class="fieldCompact" autocomplete="off">
        </label>
        <p v-if="!listed.length" class="text-sm text-muted">{{ m.noMatch }}</p>
        <ul v-else class="flex min-h-0 flex-col gap-1 overflow-y-auto">
          <li v-for="p in pageItems" :key="p.id" class="flex min-w-0 items-center justify-between gap-2" data-testid="contact">
            <span class="min-w-0 text-sm [overflow-wrap:anywhere]">
              <span class="font-medium">{{ personLabel(p) }}</span>
              <span v-if="p.name" class="text-muted"> · {{ p.email || p.phone }}</span>
            </span>
            <button v-if="withAccounts.has(p.id)" type="button" class="min-h-11 shrink-0 rounded-xl border border-accent px-3 text-sm" :aria-label="c.connectPersonLabel(personLabel(p))" @click="connect(p)">{{ c.connectPerson }}</button>
            <span v-if="isInvited(p)" class="shrink-0 text-sm text-muted">{{ m.invited }}</span>
            <span v-else-if="isAdded(p)" class="flex shrink-0 items-center gap-1">
              <span class="text-sm text-accent">✓ {{ m.added }}</span>
              <button type="button" class="min-h-11 rounded-xl px-3 text-sm underline" :aria-label="m.undoLabel(personLabel(p))" @click="emit('undo', p)">{{ m.undo }}</button>
            </span>
            <button v-else type="button" class="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm" :aria-label="m.addLabel(personLabel(p))" @click="emit('add', p)">
              {{ m.add }}
            </button>
          </li>
        </ul>
        <PageControls v-model:page="page" :page-count="pageCount" :label="m.heading" />
      </template>
      <p v-else-if="!connections.length" class="text-sm text-muted">{{ m.empty }}</p>
      <p class="text-sm text-muted" role="status" data-testid="contacts-status">{{ status }}</p>
      <RouterLink to="/connections" class="text-sm text-accent underline">{{ c.manage }}</RouterLink>
      <button type="button" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="dialog?.close()">{{ m.done }}</button>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Calendar, my people: the Contacts window. My people A to Z with a search box; Add keeps the window open
// (Added, with Undo); people already invited to the event show as Invited.
import CloseX from '@/components/CloseX.vue'
import { computed, ref, watch } from 'vue'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { contactKey } from '@/events/contacts'
import { matchesPerson, personLabel, sortPeople, uniquePeople } from '@/events/people'
import type { PersonToInvite } from '@/events/sharing'
import { myConnections, peopleWithAccounts, requestConnection, type Connection } from '@/events/connections'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { live } from '@/sync/live'
import type { PersonRow } from '@/sync/types'
import { dialogBox, fieldCompact } from '@/ui/styles'

const props = defineProps<{ pending: PersonToInvite[]; invited: { email?: string | null; phone?: string | null; user_id?: string | null }[] }>()
const emit = defineEmits<{ add: [PersonRow]; undo: [PersonRow]; addConnection: [Connection]; undoConnection: [Connection] }>()
const m = messages.contacts
const c = messages.connections
const brain = useBrainStore()

const rows = useLiveQuery<PersonRow[]>(async () => (brain.db ? live(await brain.db.people.toArray()) : []), [], [() => brain.db])
const people = computed(() => sortPeople(uniquePeople(rows.value)))
const search = ref('')
const listed = computed(() => people.value.filter((p) => matchesPerson(p, search.value)))
const { page, pageCount, pageItems } = usePagination(listed, 10)
watch(search, () => (page.value = 1))

const keys = (list: { email?: string | null; phone?: string | null }[]) => new Set(list.map((x) => contactKey(x)).filter((k): k is string => !!k))
const addedKeys = computed(() => keys(props.pending))
const invitedKeys = computed(() => keys(props.invited))
const isAdded = (p: PersonRow) => addedKeys.value.has(contactKey(p) ?? '')
const isInvited = (p: PersonRow) => invitedKeys.value.has(contactKey(p) ?? '')

// My connections (SPEC §10), fetched when the window opens; they're invited in the app.
const connections = ref<Connection[]>([])
const addedIds = computed(() => new Set(props.pending.map((p) => p.user_id).filter((x): x is string => !!x)))
const invitedIds = computed(() => new Set(props.invited.map((p) => p.user_id).filter((x): x is string => !!x)))

const withAccounts = ref<Set<string>>(new Set())
const status = ref('')
async function connect(p: PersonRow) {
  if (!p.email) return
  await requestConnection(p.email)
  status.value = c.requestSent(personLabel(p))
  withAccounts.value = await peopleWithAccounts().catch(() => new Set<string>())
}

const dialog = ref<HTMLDialogElement | null>(null)
defineExpose({
  open: () => {
    dialog.value?.showModal()
    if (!brain.online) return
    void myConnections().then((list) => (connections.value = list), () => {})
    void peopleWithAccounts().then((ids) => (withAccounts.value = ids), () => {})
  },
})
</script>
