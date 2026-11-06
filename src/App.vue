<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import SyncIndicator from '@/components/SyncIndicator.vue'
import { useAuthStore } from '@/stores/auth'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { supabase } from '@/lib/supabase'
import { supabaseRemote } from '@/sync/supabaseRemote'
import { messages } from '@/messages'
import { deviceTimeZone } from '@/tasks/days'

const route = useRoute()
const auth = useAuthStore()
const brain = useBrainStore()

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
  { to: '/', label: messages.nav.home, icon: '✓' },
  { to: '/habits', label: messages.nav.habits, icon: '🔥' },
  { to: '/quests', label: messages.nav.quests, icon: '🎲' },
  { to: '/inbox', label: messages.nav.inbox, icon: '📥' },
  { to: '/profile', label: messages.nav.profile, icon: '🙂' },
]
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-ink">
    <header v-if="showChrome" class="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div class="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
        <RouterLink to="/" class="font-bold">{{ messages.appName }}</RouterLink>
        <SyncIndicator />
      </div>
    </header>

    <RouterView class="flex-1" />

    <!-- SPEC §5: a persistent button to capture from anywhere in the app. -->
    <RouterLink
      v-if="showChrome && route.name !== 'capture'"
      to="/capture"
      class="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex min-h-14 items-center rounded-full bg-accent px-6 text-lg font-semibold text-accent-ink shadow-lg"
    >
      + {{ messages.capture.openButton }}
    </RouterLink>

    <!-- Bottom navigation: fits a phone, large touch targets (SPEC §3, §9). -->
    <nav
      v-if="showChrome"
      class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      :aria-label="messages.nav.label"
    >
      <ul class="mx-auto grid max-w-xl grid-cols-5">
        <li v-for="item in navItems" :key="item.to">
          <RouterLink
            :to="item.to"
            class="relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted"
            exact-active-class="!text-accent font-semibold"
          >
            <span class="text-lg leading-none" aria-hidden="true">{{ item.icon }}</span>
            {{ item.label }}
            <span
              v-if="item.to === '/inbox' && inboxCount"
              class="absolute top-1 right-1/2 translate-x-5 rounded-full bg-accent px-1.5 text-[10px] text-accent-ink"
              data-testid="inbox-count"
            >{{ inboxCount }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
