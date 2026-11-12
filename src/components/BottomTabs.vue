<template>
  <nav :aria-label="messages.nav.label" class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" data-testid="bottom-tabs">
    <ul class="grid grid-cols-5">
      <li v-for="item in MAIN_NAV" :key="item.to">
        <RouterLink
          :to="item.to"
          class="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs text-muted"
          active-class="!text-accent font-semibold"
        >
          <AppIcon :name="item.icon" size="size-6" />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>
      </li>
      <li>
        <button
          type="button"
          class="relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-xs"
          :class="moreCurrent ? 'font-semibold text-accent' : 'text-muted'"
          :aria-current="moreCurrent ? 'page' : undefined"
          aria-haspopup="dialog"
          @click="openMore"
        >
          <AppIcon name="more" size="size-6" :stroke-width="3" />
          <span>{{ messages.nav.more }}</span>
          <span v-if="inboxCount" class="absolute top-1 right-[calc(50%-1.5rem)] rounded-full bg-accent px-1.5 text-[0.65rem] text-accent-ink" aria-hidden="true">{{ inboxCount }}</span>
        </button>
      </li>
    </ul>
  </nav>

  <dialog
    ref="sheet"
    class="m-0 mt-auto w-full max-w-none rounded-t-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    :aria-label="messages.nav.more"
    data-testid="more-sheet"
  >
    <div class="flex flex-col gap-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 class="px-3 pb-1 text-sm font-semibold text-muted">{{ messages.nav.more }}</h2>
      <ul class="flex flex-col gap-1">
        <li v-for="item in MORE_NAV" :key="item.to">
          <RouterLink :to="item.to" class="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-bg" exact-active-class="bg-bg font-semibold" @click="sheet?.close()">
            <AppIcon :name="item.icon" size="size-5" /><span class="flex-1">{{ item.label }}</span>
            <span v-if="item.to === '/orphans' && inboxCount" class="rounded-full bg-accent px-2 text-xs text-accent-ink" data-testid="inbox-count">{{ inboxCount }}</span>
          </RouterLink>
        </li>
      </ul>
      <button type="button" class="mt-2" :class="secondaryButton" @click="sheet?.close()">{{ messages.nav.closeMore }}</button>
    </div>
    <CloseX @click="sheet?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §2 Navigation: on phones, a tab bar along the bottom (Tasks, Habits, Calendar, The Vault, More); More opens a
// panel from the bottom with everything else. The Dashboard is "My Brain" in the header.
import CloseX from '@/components/CloseX.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { messages } from '@/messages'
import { MAIN_NAV, MORE_NAV, inMore } from '@/ui/nav'
import AppIcon from '@/components/AppIcon.vue'
import { secondaryButton } from '@/ui/styles'

defineProps<{ inboxCount: number }>()
const route = useRoute()
const moreCurrent = computed(() => inMore(route.path))
const sheet = ref<HTMLDialogElement | null>(null)
function openMore() {
  sheet.value?.showModal()
}
watch(() => route.fullPath, () => sheet.value?.close())
</script>
