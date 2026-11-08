<template>
  <nav :aria-label="messages.nav.label" class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" data-testid="bottom-tabs">
    <ul class="grid grid-cols-5">
      <li v-for="item in MAIN_NAV" :key="item.to">
        <RouterLink
          :to="item.to"
          class="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs text-muted"
          active-class="!text-accent font-semibold"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path v-for="d in NAV_ICON_PATHS[item.icon]" :key="d" :d="d" />
          </svg>
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
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
            <path v-for="d in NAV_ICON_PATHS.more" :key="d" :d="d" />
          </svg>
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
          <RouterLink :to="item.to" class="flex min-h-12 items-center justify-between rounded-xl px-3 text-base hover:bg-bg" exact-active-class="bg-bg font-semibold" @click="sheet?.close()">
            {{ item.label }}
            <span v-if="item.to === '/orphans' && inboxCount" class="rounded-full bg-accent px-2 text-xs text-accent-ink" data-testid="inbox-count">{{ inboxCount }}</span>
          </RouterLink>
        </li>
        <li>
          <button type="button" class="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-base hover:bg-bg" data-testid="focus-open" @click="focusTimer">
            {{ messages.focus.menu }}
          </button>
        </li>
      </ul>
      <button type="button" class="mt-2 min-h-12 rounded-xl border border-line px-4" @click="sheet?.close()">{{ messages.nav.closeMore }}</button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
// SPEC §2 Navigation: on phones, a tab bar along the bottom (Tasks, Habits, Calendar, The Vault, More); More opens a
// panel from the bottom with everything else. The Dashboard is "My Brain" in the header.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { messages } from '@/messages'
import { MAIN_NAV, MORE_NAV, NAV_ICON_PATHS, inMore } from '@/ui/nav'

defineProps<{ inboxCount: number }>()
const emit = defineEmits<{ focus: [] }>()
const route = useRoute()
const moreCurrent = computed(() => inMore(route.path))
const sheet = ref<HTMLDialogElement | null>(null)
function openMore() {
  sheet.value?.showModal()
}
function focusTimer() {
  sheet.value?.close()
  emit('focus')
}
watch(() => route.fullPath, () => sheet.value?.close())
</script>
