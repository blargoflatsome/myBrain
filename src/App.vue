<template>
  <div class="min-h-dvh bg-bg text-ink md:flex">
    <!-- Keyboard users can jump past the menu (WCAG 2.4.1). -->
    <a
      v-if="showChrome"
      href="#content"
      class="sr-only z-[60] rounded-xl bg-accent px-4 py-3 font-semibold text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      @click.prevent="skipToContent"
    >{{ messages.skipToContent }}</a>
    <p class="sr-only" aria-live="polite" data-testid="page-announcement">{{ pageAnnouncement }}</p>
    <!-- SPEC §2 Navigation: on wide screens, the side menu (the four main places, then More). Phones use the bottom tabs. -->
    <div v-if="showChrome && wide" class="sticky top-0 h-dvh w-56 shrink-0 border-r border-line bg-bg">
      <nav :aria-label="messages.nav.label" class="flex h-full flex-col overflow-y-auto px-3 pt-4 pb-[env(safe-area-inset-bottom)]">
        <RouterLink to="/" class="mb-4 px-3 text-lg font-bold">{{ messages.appName }}</RouterLink>
        <button
          type="button"
          class="mb-2 flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-base text-muted hover:bg-surface"
          @click="searchWindow.open()"
        >
          <AppIcon name="search" />{{ messages.nav.search }}
        </button>
        <ul class="flex flex-col gap-1">
          <li v-for="item in MAIN_NAV" :key="item.to">
            <RouterLink :to="item.to" class="flex min-h-12 items-center rounded-xl px-3 text-base text-muted hover:bg-surface" active-class="!bg-surface !text-ink font-semibold">
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
        <button
          type="button"
          class="mt-1 flex min-h-12 items-center justify-between rounded-xl px-3 text-base text-muted hover:bg-surface"
          :aria-expanded="moreOpen"
          aria-controls="nav-more"
          data-testid="nav-more"
          @click="toggleMore"
        >
          <span>{{ messages.nav.more }}</span>
          <span class="flex items-center gap-2">
            <span v-if="inboxCount && !moreOpen" class="rounded-full bg-accent px-2 text-xs text-accent-ink" aria-hidden="true">{{ inboxCount }}</span>
            <AppIcon :name="moreOpen ? 'chevronUp' : 'chevronDown'" />
          </span>
        </button>
        <ul v-show="moreOpen" id="nav-more" class="flex flex-col gap-1 pl-2">
          <li v-for="item in MORE_NAV" :key="item.to">
            <RouterLink :to="item.to" class="flex min-h-12 items-center justify-between rounded-xl px-3 text-base text-muted hover:bg-surface" exact-active-class="!bg-surface !text-ink font-semibold">
              {{ item.label }}
              <span v-if="item.to === '/orphans' && inboxCount" class="rounded-full bg-accent px-2 text-xs text-accent-ink" data-testid="inbox-count">{{ inboxCount }}</span>
            </RouterLink>
          </li>
        </ul>
      </nav>
    </div>

    <div class="flex min-h-dvh min-w-0 flex-1 flex-col">
      <AlertBanner v-if="showChrome" />
      <!-- SPEC §2 Header: Account, Focus timer, alerts bell, Sign out and sync status (plus My Brain and Search on phones). -->
      <AppHeader v-if="showChrome" :wide="wide" @focus="openFocus" />

      <!-- On phones, room for the bottom tabs so nothing is hidden behind them. -->
      <div id="content" class="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <RouterView class="flex-1" />
      </div>
    </div>

    <!-- SPEC §5: a persistent button to capture from anywhere in the app. It opens over the current page. -->
    <button
      v-if="showChrome && route.name !== 'capture'"
      type="button"
      class="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex min-h-14 md:bottom-[max(1rem,env(safe-area-inset-bottom))] items-center rounded-full bg-accent px-6 text-lg font-semibold text-accent-ink shadow-lg"
      :class="{ 'capture-pulse': pulsing }"
      data-testid="capture-button"
      :data-pulsing="pulsing || undefined"
      @click="capture.open()"
    >
      + {{ messages.capture.openButton }}
    </button>
    <BottomTabs v-if="showChrome" :inbox-count="inboxCount" />
    <CaptureDialog v-if="showChrome" />
    <SearchDialog v-if="showChrome" />

    <!-- SPEC §5: full-screen reminder for due priority habits and tasks, on every screen. -->
    <PriorityReminder v-if="showChrome" />
    <UndoBar v-if="showChrome" />
    <FocusTimer v-if="showChrome" />
    <CelebrationLayer v-if="showChrome" />
  </div>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { computed, ref, watch } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import UndoBar from '@/components/UndoBar.vue'
import AlertBanner from '@/notifications/components/AlertBanner.vue'
import BottomTabs from '@/components/BottomTabs.vue'
import { MAIN_NAV, MORE_NAV, inMore } from '@/ui/nav'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import PriorityReminder from '@/reminders/components/PriorityReminder.vue'
import FocusTimer from '@/focus/components/FocusTimer.vue'
import CelebrationLayer from '@/celebrate/components/CelebrationLayer.vue'
import { useCelebrateStore } from '@/stores/celebrate'
import { useFocusStore } from '@/stores/focus'
import CaptureDialog from '@/capture/components/CaptureDialog.vue'
import SearchDialog from '@/search/components/SearchDialog.vue'
import { useSearchStore } from '@/stores/search'
import { useCaptureStore } from '@/stores/capture'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { supabase } from '@/lib/supabase'
import { supabaseRemote } from '@/sync/supabaseRemote'
import { messages } from '@/messages'
import { deviceTimeZone } from '@/tasks/days'
import { useWideScreen } from '@/composables/useWideScreen'
import { live } from '@/sync/live'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const brain = useBrainStore()
const capture = useCaptureStore()
const searchWindow = useSearchStore()
const celebrate = useCelebrateStore()
celebrate.start()

// SPEC §5 Celebrations: after a capture is saved, the Capture button gives one soft pulse (once its window is closed,
// so it can be seen).
const pulsing = ref(false)
let pulseDue = false
function pulse() {
  pulseDue = false
  if (celebrate.level === 'off') return
  pulsing.value = false
  requestAnimationFrame(() => (pulsing.value = true))
  setTimeout(() => (pulsing.value = false), 900)
}
watch(() => celebrate.captureSaved, () => (capture.isOpen ? (pulseDue = true) : pulse()))
watch(() => capture.isOpen, (open) => !open && pulseDue && pulse())

// SPEC §8 Delete my data: if my data was deleted on another device, clear this device's copy and download again.
let lastResetCheck = 0
async function checkDataReset() {
  const id = auth.user?.id
  if (!id || !navigator.onLine) return
  lastResetCheck = Date.now()
  const { data } = await supabase.from('profiles').select('data_reset_at').eq('user_id', id).maybeSingle()
  await brain.applyDataReset(data?.data_reset_at)
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastResetCheck > 60_000) void checkDataReset()
})

// Open the signed-in user's on-device store and start syncing; close it on sign-out.
watch(
  () => auth.user?.id,
  (id) => {
    if (!id) return brain.stop()
    brain.start(id, supabaseRemote(supabase))
    // SPEC §5 Tasks: keep the profile's timezone in step with the device, for server-side jobs.
    void supabase.from('profiles').update({ timezone: deviceTimeZone() }).eq('user_id', id).then(() => {})
    // SPEC §5 Accounts: the phone number is asked for once, right after sign-in (skipped when offline).
    void checkDataReset()
    void supabase
      .from('profiles')
      .select('phone, celebrations')
      .eq('user_id', id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        // SPEC §5 Celebrations: my setting follows me to this device.
        if (data?.celebrations) celebrate.setSetting(data.celebrations)
        if (error || !data || data.phone) return
        await router.isReady()
        if (route.meta.public || route.name === 'welcome') return
        void router.replace({ name: 'welcome', query: { next: route.fullPath } })
      })
  },
  { immediate: true },
)

const inboxCount = useLiveQuery(
  async () => (brain.db ? live(await brain.db.inbox.toArray()).length : 0),
  0,
  [() => brain.db],
)

const showChrome = computed(() => !route.meta.public)

// SPEC §5 Focus timer: starts (or reopens) the full-screen timer.
const focus = useFocusStore()
function openFocus() {
  focus.start()
}

// Wide screens: More opens or closes the rest of the menu; remembered on this device, and open on its own pages.
const wide = useWideScreen()
const MORE_KEY = 'my-brain:nav-more'
const moreOpen = ref(readMore() || inMore(route.path))
function readMore() {
  try {
    return localStorage.getItem(MORE_KEY) === 'open'
  } catch {
    return false
  }
}
function toggleMore() {
  moreOpen.value = !moreOpen.value
  try {
    localStorage.setItem(MORE_KEY, moreOpen.value ? 'open' : 'closed')
  } catch {
    // Storage blocked: it just won't be remembered.
  }
}
watch(
  () => route.path,
  (path) => {
    if (inMore(path)) moreOpen.value = true
  },
)

// Screen readers hear the new page's name after moving to another page (WCAG 4.1.3), without moving focus.
const pageAnnouncement = ref('')
watch(
  () => route.name,
  (name, old) => {
    if (old !== undefined) pageAnnouncement.value = messages.pageTitles[String(name)] ?? ''
  },
)
function skipToContent() {
  const target = document.querySelector<HTMLElement>('#content h1') ?? document.getElementById('content')
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus()
}
</script>
