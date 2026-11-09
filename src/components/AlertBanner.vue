<template>
  <div class="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-50 flex justify-center px-3" aria-live="polite" role="status">
    <div
      v-if="current"
      class="pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-2xl border border-accent bg-surface p-3 text-ink shadow-lg"
      data-testid="alert-banner"
      @mouseenter="hold = true"
      @mouseleave="hold = false"
      @focusin="hold = true"
      @focusout="hold = false"
    >
      <button type="button" class="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg px-1 text-left" @click="go">
        <span class="font-semibold [overflow-wrap:anywhere]">{{ current.title }}</span>
        <span v-if="current.body" class="text-sm text-muted [overflow-wrap:anywhere]">{{ current.body }}</span>
      </button>
      <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink" :aria-label="m.closeBanner" @click="next">
        <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// SPEC §6 In-app alerts: while the app is open, a new alert slides in at the top. Tapping it goes where I deal with
// it (and counts it as seen), ✕ closes it, and it hides after 8 seconds unless the mouse or keyboard is on it.
// Alerts that were waiting when the app opened don't pop up; several new ones show one after another.
import { onScopeDispose, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAlerts } from '@/composables/useAlerts'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import type { NotificationRow } from '@/sync/types'

const SHOW_MS = 8000
const m = messages.alerts
const brain = useBrainStore()
const router = useRouter()
const { alerts } = useAlerts()

// Only alerts sent while the app is open pop up (a couple of minutes' grace for clock differences); ones that were
// waiting when it opened are under the bell. An alert is new once per sending: a reminder sent again has a new time.
const GRACE_MS = 2 * 60 * 1000
const openedAt = new Date(Date.now() - GRACE_MS).toISOString()
const keyOf = (n: NotificationRow) => `${n.id}@${n.sent_at}`
const shown = new Set<string>()
const queue = ref<NotificationRow[]>([])
const current = ref<NotificationRow | null>(null)
const hold = ref(false)
let left = SHOW_MS
let timer: ReturnType<typeof setInterval> | undefined

watch(
  alerts,
  (list) => {
    for (const n of [...list].reverse()) {
      const k = keyOf(n)
      if (shown.has(k) || n.read_at || n.sent_at < openedAt) continue
      shown.add(k)
      queue.value.push(n)
    }
    if (!current.value) next()
  },
  { immediate: true },
)

function next() {
  current.value = queue.value.shift() ?? null
  left = SHOW_MS
  clearInterval(timer)
  if (!current.value) return
  timer = setInterval(() => {
    if (hold.value) return
    left -= 250
    if (left <= 0) next()
  }, 250)
}
async function go() {
  const n = current.value
  if (!n) return
  next()
  await brain.markNotificationRead(n.id)
  await router.push(n.url)
}
onScopeDispose(() => clearInterval(timer))
</script>
