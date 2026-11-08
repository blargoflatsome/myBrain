<template>
  <dialog ref="dialog" :class="dialogBox" :aria-label="m.heading" data-testid="contacts-dialog" @close="search = ''">
    <div class="flex max-h-[85dvh] flex-col gap-3 p-5">
      <h3 class="text-lg font-semibold">{{ m.heading }}</h3>
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
      <p v-else class="text-sm text-muted">{{ m.empty }}</p>
      <button type="button" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="dialog?.close()">{{ m.done }}</button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Calendar, my people: the Contacts window. My people A to Z with a search box; Add keeps the window open
// (Added, with Undo); people already invited to the event show as Invited.
import { computed, ref, watch } from 'vue'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { contactKey } from '@/events/contacts'
import { matchesPerson, personLabel, sortPeople, uniquePeople } from '@/events/people'
import type { PersonToInvite } from '@/events/sharing'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { live } from '@/sync/live'
import type { PersonRow } from '@/sync/types'
import { dialogBox, fieldCompact } from '@/ui/styles'

const props = defineProps<{ pending: PersonToInvite[]; invited: { email?: string | null; phone?: string | null }[] }>()
const emit = defineEmits<{ add: [PersonRow]; undo: [PersonRow] }>()
const m = messages.contacts
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

const dialog = ref<HTMLDialogElement | null>(null)
defineExpose({ open: () => dialog.value?.showModal() })
</script>
