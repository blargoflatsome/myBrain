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
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-ink">
    <header v-if="showChrome" class="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <nav class="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
        <RouterLink to="/" class="font-bold">{{ messages.appName }}</RouterLink>
        <div class="flex items-center gap-4">
          <SyncIndicator />
          <RouterLink to="/quests" class="text-sm text-muted">{{ messages.nav.quests }}</RouterLink>
          <RouterLink to="/inbox" class="text-sm text-muted">
            {{ messages.nav.inbox }}<span v-if="inboxCount" class="ml-1 rounded-full bg-accent px-1.5 text-xs text-accent-ink">{{ inboxCount }}</span>
          </RouterLink>
        </div>
      </nav>
    </header>

    <RouterView class="flex-1" />

    <!-- SPEC §5: a persistent button to capture from anywhere in the app. -->
    <RouterLink
      v-if="showChrome && route.name !== 'capture'"
      to="/capture"
      class="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] flex min-h-14 items-center rounded-full bg-accent px-6 text-lg font-semibold text-accent-ink shadow-lg"
    >
      + {{ messages.capture.openButton }}
    </RouterLink>
  </div>
</template>
