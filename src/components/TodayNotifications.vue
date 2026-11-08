<template>
  <section :class="card" data-testid="dash-notifications" aria-labelledby="dash-notifications-heading">
    <div class="flex items-center justify-between gap-3">
      <h2 id="dash-notifications-heading" class="text-lg font-semibold">{{ m.heading }}</h2>
      <button v-if="today.length" type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="clearAll">{{ m.clearAll }}</button>
    </div>
    <p v-if="!today.length" class="text-muted">{{ m.empty }}</p>
    <ul v-else class="divide-y divide-line">
      <li v-for="n in pageItems" :key="n.id" class="flex items-start gap-2 py-2" data-testid="notification">
        <RouterLink :to="n.url" class="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-1 hover:bg-bg">
          <span class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-medium">{{ n.title }}</span>
            <span class="text-xs text-muted tabular-nums">{{ timeOf(n.sent_at) }}</span>
          </span>
          <span v-if="n.body" class="text-sm text-muted">{{ n.body }}</span>
        </RouterLink>
        <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink" :aria-label="m.clear(n.title)" @click="clear(n.id)">
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </li>
    </ul>
    <PageControls v-model:page="page" :page-count="pageCount" :label="m.heading" />
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Dashboard: every notification the app sent me today, newest first, 5 at a time; clear one or all.
// Only today's show: at midnight they're gone here at once, and the server clears them for good.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageControls from '@/components/PageControls.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { usePagination } from '@/composables/usePagination'
import { useToday } from '@/composables/useToday'
import { live } from '@/sync/live'
import { messages } from '@/messages'
import { card } from '@/ui/styles'
import type { NotificationRow } from '@/sync/types'

const PER_PAGE = 5
const brain = useBrainStore()
const m = messages.notificationsToday
const { today: date } = useToday()

const all = useLiveQuery<NotificationRow[]>(async () => (brain.db ? live(await brain.db.notifications.toArray()) : []), [], [() => brain.db])
const today = computed(() => all.value.filter((n) => n.local_date === date.value).sort((a, b) => b.sent_at.localeCompare(a.sent_at)))
const { page, pageCount, pageItems } = usePagination(today, PER_PAGE)

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const announcement = ref('')
async function clear(id: string) {
  await brain.clearNotification(id)
  announcement.value = m.cleared
}
async function clearAll() {
  await brain.clearNotifications(date.value)
  announcement.value = m.cleared
}
</script>
