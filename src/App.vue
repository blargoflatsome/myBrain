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
    <!-- Left navigation, text only. Always visible from tablet width up; a slide-out menu on phones. -->
    <template v-if="showChrome">
      <div v-if="menuOpen" class="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden="true" @click="menuOpen = false" />
      <!-- On a phone the open menu is a window (dialog); the navigation inside keeps its landmark. -->
      <div
        id="main-nav"
        ref="nav"
        :role="menuModal ? 'dialog' : undefined"
        :aria-modal="menuModal ? 'true' : undefined"
        :aria-label="menuModal ? messages.nav.menu : undefined"
        class="fixed inset-y-0 left-0 z-40 w-56 border-r border-line bg-bg md:sticky md:top-0 md:z-auto md:block md:h-dvh"
        :class="menuOpen ? 'block' : 'hidden'"
        @keydown.esc="menuModal && closeMenu()"
      >
        <nav
          :aria-label="messages.nav.label"
          class="flex h-full flex-col px-3 pt-4 pb-[env(safe-area-inset-bottom)]"
        >
          <RouterLink to="/" class="mb-4 px-3 text-lg font-bold">{{ messages.appName }}</RouterLink>
          <button
            type="button"
            class="mb-2 flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-base text-muted hover:bg-surface"
            @click="searchWindow.open()"
          >
            <span aria-hidden="true">⌕</span>{{ messages.nav.search }}
          </button>
          <ul class="flex flex-col gap-1">
            <li v-for="item in navItems" :key="item.to">
              <RouterLink
                :to="item.to"
                class="flex min-h-12 items-center justify-between rounded-xl px-3 text-base text-muted hover:bg-surface"
                exact-active-class="!bg-surface !text-ink font-semibold"
              >
                {{ item.label }}
                <span
                  v-if="item.to === '/orphans' && inboxCount"
                  class="rounded-full bg-accent px-2 text-xs text-accent-ink"
                  data-testid="inbox-count"
                >{{ inboxCount }}</span>
              </RouterLink>
            </li>
          </ul>
          <button
            type="button"
            class="mt-1 flex min-h-12 items-center rounded-xl px-3 text-base text-muted hover:bg-surface"
            data-testid="focus-open"
            @click="openFocus"
          >
            {{ messages.focus.menu }}
          </button>
          <div v-if="wide" class="mt-auto px-3 py-4">
            <SyncIndicator />
          </div>
        </nav>
      </div>
    </template>

    <div class="flex min-h-dvh min-w-0 flex-1 flex-col">
      <header v-if="showChrome" class="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur md:hidden">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <button
            ref="menuButton"
            type="button"
            class="min-h-11 rounded-xl border border-line px-3 text-sm font-medium"
            aria-controls="main-nav"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            {{ messages.nav.menu }}
          </button>
          <RouterLink to="/" class="font-bold">{{ messages.appName }}</RouterLink>
          <div class="flex items-center gap-2">
            <SyncIndicator v-if="!wide" />
            <button type="button" class="flex size-11 items-center justify-center rounded-xl border border-line text-lg" :aria-label="messages.search.open" @click="searchWindow.open()">
              <span aria-hidden="true">⌕</span>
            </button>
          </div>
        </div>
      </header>

      <div id="content" class="flex flex-1 flex-col">
        <RouterView class="flex-1" />
      </div>
    </div>

    <!-- SPEC §5: a persistent button to capture from anywhere in the app. It opens over the current page. -->
    <button
      v-if="showChrome && route.name !== 'capture'"
      type="button"
      class="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex min-h-14 items-center rounded-full bg-accent px-6 text-lg font-semibold text-accent-ink shadow-lg"
      @click="capture.open()"
    >
      + {{ messages.capture.openButton }}
    </button>
    <CaptureDialog v-if="showChrome" />
    <SearchDialog v-if="showChrome" />

    <!-- SPEC §5: full-screen reminder for due priority habits and tasks, on every screen. -->
    <PriorityReminder v-if="showChrome" />
    <FocusTimer v-if="showChrome" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import SyncIndicator from '@/components/SyncIndicator.vue'
import PriorityReminder from '@/components/PriorityReminder.vue'
import FocusTimer from '@/components/FocusTimer.vue'
import { useFocusStore } from '@/stores/focus'
import CaptureDialog from '@/components/CaptureDialog.vue'
import SearchDialog from '@/components/SearchDialog.vue'
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
      .select('phone')
      .eq('user_id', id)
      .maybeSingle()
      .then(async ({ data, error }) => {
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
  menuOpen.value = false
  focus.start()
}
const navItems = [
  { to: '/', label: messages.nav.dashboard },
  { to: '/tasks', label: messages.nav.home },
  { to: '/habits', label: messages.nav.habits },
  { to: '/routines', label: messages.nav.routines },
  { to: '/journal', label: messages.nav.journal },
  { to: '/calendar', label: messages.nav.calendar },
  { to: '/vault', label: messages.nav.vault },
  { to: '/quests', label: messages.nav.quests },
  { to: '/orphans', label: messages.nav.inbox },
  { to: '/account', label: messages.nav.account },
  { to: '/docs', label: messages.nav.help },
]

// Phone: the menu slides out from the left. Wider screens: it is always shown on the left.
const wide = useWideScreen()
const menuOpen = ref(false)
watch(() => route.fullPath, () => (menuOpen.value = false))
// On a phone the open menu is a window (SPEC §2): focus moves into it, stays inside, and Escape closes it,
// returning focus to the Menu button.
const menuButton = ref<HTMLButtonElement | null>(null)
const nav = ref<HTMLElement | null>(null)
const menuModal = computed(() => menuOpen.value && !wide.value)
watch(menuModal, async (open, was) => {
  await nextTick()
  if (open) nav.value?.querySelector<HTMLElement>('a[href], button')?.focus()
  else if (was && nav.value?.contains(document.activeElement)) menuButton.value?.focus()
})
function closeMenu() {
  menuOpen.value = false
  menuButton.value?.focus()
}

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
