<template>
  <main class="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-6 pb-28">
    <h1 class="text-2xl font-bold break-words">{{ heading }}</h1>

    <p v-if="state === 'loading'" class="text-muted" role="status">{{ m.loading }}</p>

    <template v-else-if="state === 'nothing' || state === 'unusable'">
      <p role="status" data-testid="share-problem">{{ state === 'nothing' ? m.nothingShared : m.nothingUsable(shared.skipped) }}</p>
      <RouterLink to="/calendar" class="text-accent underline">{{ m.toCalendar }}</RouterLink>
    </template>

    <template v-else>
      <section :class="card" aria-labelledby="share-people-heading">
        <h2 id="share-people-heading" class="font-semibold">{{ m.peopleHeading }}</h2>
        <ul class="flex flex-col gap-1">
          <li v-for="p in shared.people" :key="p.email ?? p.phone" class="min-w-0 [overflow-wrap:anywhere]" data-testid="shared-person">
            <span class="font-medium">{{ p.name || p.email || p.phone }}</span>
            <span v-if="p.name" class="text-sm text-muted"> · {{ p.email ?? p.phone }}</span>
          </li>
        </ul>
        <p v-if="shared.skipped || shared.extra" class="text-sm text-muted" data-testid="share-left-out">{{ m.leftOut(shared.skipped, shared.extra) }}</p>
        <p class="text-sm text-muted">{{ m.howItWorks }}</p>
      </section>

      <button type="button" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="choose(null)">{{ m.newEvent }}</button>

      <section class="flex flex-col gap-2" aria-labelledby="share-events-heading">
        <h2 id="share-events-heading" class="font-semibold">{{ m.eventsHeading }}</h2>
        <p v-if="!upcoming.length" class="text-muted">{{ m.noEvents }}</p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="e in pageItems" :key="e.id">
            <button type="button" class="flex min-h-12 w-full min-w-0 flex-col items-start rounded-xl border border-line px-3 py-2 text-left" data-testid="share-event" @click="choose(e)">
              <span class="font-medium [overflow-wrap:anywhere]">{{ e.title }}</span>
              <span class="text-sm text-muted">{{ when(e) }}</span>
            </button>
          </li>
        </ul>
        <PageControls v-model:page="page" :page-count="pageCount" :label="m.eventsHeading" />
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Calendar, "Sharing a contact": contacts shared from the phone's Contacts app arrive here; I choose one of
// my upcoming events (or a new one) and they're ready to invite there. Nothing is invited until I save the event.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { setReadyToInvite } from '@/events/readyToInvite'
import { readContactFile, type SharedContacts } from '@/events/vcard'
import { takeSharedContacts } from '@/share/target'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { live } from '@/sync/live'
import type { EventRow } from '@/sync/types'
import { formatTime } from '@/time/parse'
import { shortDay } from '@/ui/dates'
import { card } from '@/ui/styles'

const m = messages.shareContact
const brain = useBrainStore()
const router = useRouter()
const { today } = useToday()

const state = ref<'loading' | 'nothing' | 'unusable' | 'ready'>('loading')
const shared = ref<SharedContacts>({ people: [], skipped: 0, extra: 0 })
onMounted(async () => {
  let text: string | null = null
  try {
    text = await takeSharedContacts()
  } catch {
    text = null
  }
  if (text === null) return (state.value = 'nothing')
  shared.value = readContactFile(text)
  state.value = shared.value.people.length ? 'ready' : 'unusable'
})

const heading = computed(() => {
  const people = shared.value.people
  if (state.value !== 'ready') return m.headingNone
  return people.length === 1 ? m.headingOne(people[0]!.name || people[0]!.email || people[0]!.phone || '') : m.headingMany(people.length)
})

// My own upcoming events, soonest first: not cancelled, not over yet, or repeating.
const events = useLiveQuery<EventRow[]>(async () => (brain.db ? live(await brain.db.events.toArray()) : []), [], [() => brain.db])
const upcoming = computed(() =>
  events.value
    .filter((e) => e.user_id === brain.userId && !e.cancelled_at && (e.end_date >= today.value || e.repeat !== 'never'))
    .sort((a, b) => (a.start_date + (a.start_time ?? '')).localeCompare(b.start_date + (b.start_time ?? ''))),
)
const { page, pageCount, pageItems } = usePagination(upcoming, 10)
const when = (e: EventRow) => [shortDay(e.start_date), e.start_time ? formatTime(e.start_time) : m.allDay, e.repeat !== 'never' ? m.repeats : ''].filter(Boolean).join(' · ')

function choose(e: EventRow | null) {
  setReadyToInvite(shared.value.people)
  if (e) void router.push({ path: '/calendar', query: { date: e.start_date, event: e.id, invite: '1' } })
  else void router.push({ path: '/calendar', query: { date: today.value, new: '1', invite: '1' } })
}
</script>
