<template>
  <section id="trophies" :class="card" data-testid="dash-trophies" aria-labelledby="dash-trophies-heading">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 id="dash-trophies-heading" class="text-lg font-semibold">{{ t.heading }}</h2>
      <span class="text-sm text-muted" data-testid="dash-trophy-count">{{ t.count(earnedCount) }}</span>
    </div>

    <!-- SPEC §5 Dashboard: close to a trophy, when one is at least 75% of the way to its next level. -->
    <button
      v-if="closest"
      type="button"
      class="flex min-h-11 items-center gap-2 self-start rounded-xl text-left text-sm hover:text-accent"
      data-testid="dash-trophy-close"
      @click="openDetails(closest)"
    >
      <AppIcon name="trophy" class="shrink-0 text-done" />{{ closeLine }}
    </button>

    <template v-if="!showAll">
      <p v-if="!latest.length" class="text-sm text-muted">{{ t.none }}</p>
      <ul v-else id="dash-trophy-list" class="grid gap-2 sm:grid-cols-2">
        <TrophyCard v-for="item in latest" :key="item.id" :item="item" @open="openDetails" />
      </ul>
    </template>
    <div v-else id="dash-trophy-list" class="flex flex-col gap-6" data-testid="trophy-groups">
      <TrophyGroups :items="earned" id-prefix="trophy-category" @open="openDetails" />
      <p v-if="!earned.length" class="text-sm text-muted">{{ t.none }}</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        :class="smallButton"
        aria-controls="dash-trophy-list"
        :aria-expanded="showAll"
        data-testid="dash-trophies-more"
        @click="showAll = !showAll"
      >
        {{ showAll ? t.seeFewer : t.seeAll }}
      </button>
      <button type="button" :class="smallButton" data-testid="dash-trophies-locked" @click="lockedDialog?.showModal()">
        {{ t.seeLocked }}
      </button>
    </div>

    <dialog ref="lockedDialog" :class="dialogBox" :aria-label="t.lockedHeading" data-testid="locked-trophies">
      <div class="flex flex-col gap-6 p-5">
        <div class="flex flex-col gap-1 pr-10">
          <h2 class="text-lg font-semibold">{{ t.lockedHeading }}</h2>
          <p class="text-sm text-muted">{{ t.lockedHint }}</p>
        </div>
        <p v-if="!locked.length" class="text-sm text-muted">{{ t.lockedNone }}</p>
        <TrophyGroups :items="locked" id-prefix="locked-cat" @open="openDetails" />
        <button type="button" class="self-start" :class="secondaryButton" @click="lockedDialog?.close()">{{ t.close }}</button>
      </div>
      <CloseX @click="lockedDialog?.close()" />
    </dialog>

    <TrophyDetailsDialog ref="detailsDialog" />
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Trophies: the Dashboard's Trophies section: my 3 newest levels earned; See all trophies lists what I've
// earned or started by category, with progress; See locked trophies opens a window with the rest (surprises as ???).
// Tapping an earned trophy opens what I did to earn it.
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import CloseX from '@/components/CloseX.vue'
import TrophyCard from '@/trophies/components/TrophyCard.vue'
import TrophyGroups from '@/trophies/components/TrophyGroups.vue'
import TrophyDetailsDialog from '@/trophies/components/TrophyDetailsDialog.vue'
import { closestTrophy, newest, trophyName, type BoardItem } from '@/trophies/board'
import { TIERS } from '@/trophies/definitions'
import { messages } from '@/messages'
import { card, dialogBox, secondaryButton, smallButton } from '@/ui/styles'

const props = defineProps<{ items: BoardItem[] }>()
const cm = messages.celebrations
const t = cm.trophies

const detailsDialog = ref<InstanceType<typeof TrophyDetailsDialog> | null>(null)
const openDetails = (item: BoardItem) => detailsDialog.value?.open(item)

const showAll = ref(false)
const lockedDialog = ref<HTMLDialogElement | null>(null)
const earnedCount = computed(() => props.items.filter((i) => i.level).length)
const latest = computed(() => newest(props.items, 3))
const earned = computed(() => props.items.filter((i) => !i.locked))
const locked = computed(() => props.items.filter((i) => i.locked))
const closest = computed(() => closestTrophy(props.items))
const closeLine = computed(() => {
  const c = closest.value
  if (!c) return ''
  const name = c.levels > 1 ? `${trophyName(c)} ${t.tiers[TIERS[c.level]!]}` : trophyName(c)
  return t.closeTo(c.next! - c.value!, c.unit, name)
})
</script>
