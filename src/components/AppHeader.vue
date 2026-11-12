<template>
  <header class="sticky top-0 z-10 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur" :aria-label="messages.header.label" data-testid="app-header">
    <div class="flex items-center gap-1 px-2 py-2 min-[360px]:px-3" :class="wide ? 'justify-end' : 'justify-between'">
      <div v-if="!wide" class="flex items-center gap-1">
        <RouterLink to="/" :class="iconButton" :aria-label="messages.appName" data-testid="header-home">
          <AppIcon name="home" size="size-5" />
        </RouterLink>
        <button type="button" :class="iconButton" :aria-label="messages.search.open" @click="searchWindow.open()">
          <AppIcon name="search" size="size-5" />
        </button>
      </div>
      <div class="flex items-center gap-1">
        <RouterLink to="/account" :class="iconButton" :aria-label="messages.header.account" active-class="!border-accent" data-testid="header-account">
          <img v-if="avatarUrl && !avatarFailed" :src="avatarUrl" alt="" class="size-8 rounded-full object-cover" referrerpolicy="no-referrer" data-testid="header-avatar" @error="avatarFailed = true">
          <AppIcon v-else name="user" size="size-5" />
        </RouterLink>
        <button type="button" :class="iconButton" :aria-label="messages.header.timer" data-testid="focus-open" @click="emit('focus')">
          <AppIcon name="timer" size="size-5" />
        </button>
        <AlertsBell />
        <SyncIndicator :compact="!wide" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
// SPEC §2 Navigation, Header: Account (my picture or a person icon), Focus timer, alerts bell and sync status, on every signed-in page. Phones also get My Brain and Search here; wide screens have those in the
// side menu.
import { useProfileStore } from '@/stores/profile'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AlertsBell from '@/notifications/components/AlertsBell.vue'
import SyncIndicator from '@/components/SyncIndicator.vue'
import { useSearchStore } from '@/stores/search'
import { messages } from '@/messages'

defineProps<{ wide: boolean }>()
const emit = defineEmits<{ focus: [] }>()

// 44 px, or 40 px under 360 px wide so everything fits on one line at 320 px (SPEC §2 Header).
const iconButton = 'flex size-10 min-[360px]:size-11 shrink-0 items-center justify-center rounded-xl border border-line'
const searchWindow = useSearchStore()

// The profile picture; when there is none, or it can't load (offline, removed), the plain person icon shows.
const profile = useProfileStore()
const avatarUrl = computed(() => profile.shown?.avatar_url ?? null)
const avatarFailed = ref(false)
watch(avatarUrl, () => (avatarFailed.value = false))
</script>
