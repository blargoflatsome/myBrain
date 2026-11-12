<template>
  <button
    type="button"
    class="relative flex size-10 min-[360px]:size-11 shrink-0 items-center justify-center rounded-xl border border-line"
    :aria-label="unread ? m.bellLabel(unread) : m.bellLabelNone"
    data-testid="alerts-bell"
    @click="openList"
  >
    <AppIcon name="bell" size="size-5" />
    <span v-if="unread" class="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-danger-ink" data-testid="alerts-count" aria-hidden="true">
      {{ unread > 9 ? '9+' : unread }}
    </span>
  </button>

  <dialog ref="dialog" :class="dialogBox" :aria-label="m.heading" data-testid="alerts-list" @close="listOpen = false">
    <div v-if="listOpen" class="flex max-h-[85dvh] flex-col gap-3 p-5">
      <div class="flex items-center justify-between gap-3 pr-12">
        <h2 class="text-lg font-semibold">{{ m.heading }}</h2>
        <button v-if="alerts.length" type="button" :class="smallButton" @click="clearAll">{{ m.clearAll }}</button>
      </div>
      <p v-if="!alerts.length" class="text-muted">{{ m.empty }}</p>
      <ul v-else class="flex min-h-0 flex-col divide-y divide-line overflow-y-auto">
        <li v-for="n in pageItems" :key="n.id" class="flex items-start gap-2 py-2" data-testid="alert" :data-unread="!n.read_at">
          <button type="button" class="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-1 text-left hover:bg-bg" @click="go(n)">
            <span class="flex flex-wrap items-baseline gap-x-2">
              <span v-if="!n.read_at" class="rounded-full bg-accent px-2 text-xs font-semibold text-accent-ink">{{ m.new }}</span>
              <span class="font-medium [overflow-wrap:anywhere]">{{ n.title }}</span>
              <span class="text-xs text-muted tabular-nums">{{ when(n.sent_at) }}</span>
            </span>
            <span v-if="n.body" class="text-sm text-muted [overflow-wrap:anywhere]">{{ n.body }}</span>
          </button>
          <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink" :aria-label="m.clear(n.title)" @click="clear(n.id)">
            <AppIcon name="close" size="size-5" />
          </button>
        </li>
      </ul>
      <PageControls v-model:page="page" :page-count="pageCount" :label="m.heading" />
      <button type="button" :class="[smallButton, 'self-end']" @click="dialog?.close()">{{ m.close }}</button>
      <p class="sr-only" aria-live="polite">{{ announcement }}</p>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §6 In-app alerts: the bell in the header with how many alerts I haven't dealt with; it opens them all, newest
// first, 5 per page (with none, a short "All caught up" message instead). Tapping one takes me where I deal with it and counts it as seen; ✕ or Clear all clears them.
import AppIcon from '@/components/AppIcon.vue'
import CloseX from '@/components/CloseX.vue'
import { momentLabel } from '@/ui/dates'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PageControls from '@/components/PageControls.vue'
import { useAlerts } from '@/notifications/useAlerts'
import { usePagination } from '@/composables/usePagination'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { useCelebrateStore } from '@/stores/celebrate'
import type { NotificationRow } from '@/sync/types'
import { dialogBox, smallButton } from '@/ui/styles'

const m = messages.alerts
const brain = useBrainStore()
const router = useRouter()
const celebrate = useCelebrateStore()
const { alerts, unread } = useAlerts()
const { page, pageCount, pageItems } = usePagination(alerts, 5)

const when = (iso: string) => momentLabel(iso)

const dialog = ref<HTMLDialogElement | null>(null)
const announcement = ref('')
// The list is only built while it's open.
const listOpen = ref(false)
function openList() {
  // Nothing waiting: a short "All caught up" that fades by itself, instead of an empty list.
  if (!alerts.value.length) return celebrate.say(m.empty)
  listOpen.value = true
  page.value = 1
  announcement.value = ''
  dialog.value?.showModal()
}
async function go(n: NotificationRow) {
  dialog.value?.close()
  await brain.markNotificationRead(n.id)
  await router.push(n.url)
}
async function clear(id: string) {
  await brain.clearNotification(id)
  announcement.value = m.cleared
}
async function clearAll() {
  await brain.clearNotifications()
  announcement.value = m.cleared
}
</script>
