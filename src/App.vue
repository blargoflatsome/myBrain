<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import SyncIndicator from '@/components/SyncIndicator.vue'
import PriorityReminder from '@/components/PriorityReminder.vue'
import CaptureDialog from '@/components/CaptureDialog.vue'
import { useCaptureStore } from '@/stores/capture'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { supabase } from '@/lib/supabase'
import { supabaseRemote } from '@/sync/supabaseRemote'
import { messages } from '@/messages'
import { deviceTimeZone } from '@/tasks/days'
import { useWideScreen } from '@/composables/useWideScreen'

const route = useRoute()
const auth = useAuthStore()
const brain = useBrainStore()
const capture = useCaptureStore()

// Open the signed-in user's on-device store and start syncing; close it on sign-out.
watch(
  () => auth.user?.id,
  (id) => {
    if (!id) return brain.stop()
    brain.start(id, supabaseRemote(supabase))
    // SPEC §5 Tasks: keep the profile's timezone in step with the device, for server-side jobs.
    void supabase.from('profiles').update({ timezone: deviceTimeZone() }).eq('user_id', id).then(() => {})
  },
  { immediate: true },
)

const inboxCount = useLiveQuery(
  async () => (brain.db ? (await brain.db.inbox.toArray()).filter((i) => !i.deleted_at).length : 0),
  0,
  [() => brain.db],
)

const showChrome = computed(() => !route.meta.public)

const navItems = [
  { to: '/', label: messages.nav.home },
  { to: '/habits', label: messages.nav.habits },
  { to: '/routines', label: messages.nav.routines },
  { to: '/journal', label: messages.nav.journal },
  { to: '/quests', label: messages.nav.quests },
  { to: '/inbox', label: messages.nav.inbox },
  { to: '/account', label: messages.nav.account },
]

// Phone: the menu slides out from the left. Wider screens: it is always shown on the left.
const wide = useWideScreen()
const menuOpen = ref(false)
watch(() => route.fullPath, () => (menuOpen.value = false))
</script>

<template>
  <div class="min-h-dvh bg-bg text-ink md:flex">
    <!-- Left navigation, text only. Always visible from tablet width up; a slide-out menu on phones. -->
    <template v-if="showChrome">
      <div v-if="menuOpen" class="fixed inset-0 z-30 bg-black/40 md:hidden" aria-hidden="true" @click="menuOpen = false" />
      <nav
        id="main-nav"
        :aria-label="messages.nav.label"
        class="fixed inset-y-0 left-0 z-40 w-56 flex-col border-r border-line bg-bg px-3 pt-4 pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:z-auto md:flex md:h-dvh"
        :class="menuOpen ? 'flex' : 'hidden'"
      >
        <RouterLink to="/" class="mb-4 px-3 text-lg font-bold">{{ messages.appName }}</RouterLink>
        <ul class="flex flex-col gap-1">
          <li v-for="item in navItems" :key="item.to">
            <RouterLink
              :to="item.to"
              class="flex min-h-12 items-center justify-between rounded-xl px-3 text-base text-muted hover:bg-surface"
              exact-active-class="!bg-surface !text-ink font-semibold"
            >
              {{ item.label }}
              <span
                v-if="item.to === '/inbox' && inboxCount"
                class="rounded-full bg-accent px-2 text-xs text-accent-ink"
                data-testid="inbox-count"
              >{{ inboxCount }}</span>
            </RouterLink>
          </li>
        </ul>
        <div v-if="wide" class="mt-auto px-3 py-4">
          <SyncIndicator />
        </div>
      </nav>
    </template>

    <div class="flex min-h-dvh min-w-0 flex-1 flex-col">
      <header v-if="showChrome" class="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur md:hidden">
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            class="min-h-11 rounded-xl border border-line px-3 text-sm font-medium"
            aria-controls="main-nav"
            :aria-expanded="menuOpen"
            @click="menuOpen = !menuOpen"
          >
            {{ messages.nav.menu }}
          </button>
          <RouterLink to="/" class="font-bold">{{ messages.appName }}</RouterLink>
          <SyncIndicator v-if="!wide" />
        </div>
      </header>

      <RouterView class="flex-1" />
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

    <!-- SPEC §5: full-screen reminder for due priority habits and tasks, on every screen. -->
    <PriorityReminder v-if="showChrome" />
  </div>
</template>
