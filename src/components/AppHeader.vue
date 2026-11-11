<template>
  <header class="sticky top-0 z-10 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur" :aria-label="messages.header.label" data-testid="app-header">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" :class="wide ? 'justify-end' : 'justify-between'">
      <div v-if="!wide" class="flex items-center gap-1">
        <RouterLink to="/" class="flex min-h-11 items-center pr-1 font-bold">{{ messages.appName }}</RouterLink>
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
        <button type="button" :class="iconButton" :aria-label="messages.signOut.button" data-testid="header-sign-out" @click="confirmSignOut?.open()">
          <AppIcon name="signOut" size="size-5" />
        </button>
        <SyncIndicator :compact="!wide" class="pl-1" />
      </div>
    </div>
    <ConfirmDialog
      ref="confirmSignOut"
      :heading="messages.signOut.confirmHeading"
      :body="messages.signOut.confirmBody"
      :confirm-label="messages.signOut.button"
      :keep-label="messages.signOut.keep"
      @confirm="signOut"
    />
  </header>
</template>

<script setup lang="ts">
// SPEC §2 Navigation, Header: Account (my picture or a person icon), Focus timer, alerts bell, Sign out (asks first)
// and sync status, on every signed-in page. Phones also get My Brain and Search here; wide screens have those in the
// side menu.
import { ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AlertsBell from '@/components/AlertsBell.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SyncIndicator from '@/components/SyncIndicator.vue'
import { useAuthStore } from '@/stores/auth'
import { useSearchStore } from '@/stores/search'
import { supabase } from '@/lib/supabase'
import { messages } from '@/messages'

defineProps<{ wide: boolean }>()
const emit = defineEmits<{ focus: [] }>()

const iconButton = 'flex size-11 items-center justify-center rounded-xl border border-line'
const auth = useAuthStore()
const router = useRouter()
const searchWindow = useSearchStore()
const confirmSignOut = ref<InstanceType<typeof ConfirmDialog> | null>(null)

// The profile picture; when there is none, or it can't load (offline, removed), the plain person icon shows.
const avatarUrl = ref<string | null>(null)
const avatarFailed = ref(false)
watch(
  () => auth.user?.id,
  async (id) => {
    avatarUrl.value = null
    avatarFailed.value = false
    if (!id) return
    const { data } = await supabase.from('profiles').select('avatar_url').eq('user_id', id).maybeSingle()
    if (auth.user?.id === id) avatarUrl.value = data?.avatar_url ?? null
  },
  { immediate: true },
)

async function signOut() {
  confirmSignOut.value?.close()
  await auth.signOut()
  await router.push({ name: 'sign-in' })
}
</script>
