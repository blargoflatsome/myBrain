<template>
  <section id="trophies" :class="card" data-testid="dash-trophies" aria-labelledby="dash-trophies-heading">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 id="dash-trophies-heading" class="text-lg font-semibold">{{ t.heading }}</h2>
      <span class="text-sm text-muted" data-testid="dash-trophy-count">{{ t.count(earnedCount) }}</span>
    </div>

    <template v-if="!showAll">
      <p v-if="!latest.length" class="text-sm text-muted">{{ t.none }}</p>
      <ul v-else id="dash-trophy-list" class="grid gap-2 sm:grid-cols-2">
        <TrophyCard v-for="item in latest" :key="item.id" :item="item" @open="openDetails" />
      </ul>
    </template>
    <div v-else id="dash-trophy-list" class="flex flex-col gap-6" data-testid="trophy-groups">
      <section v-for="g in earnedGroups" :key="g.category" class="flex flex-col gap-2" :aria-labelledby="`trophy-cat-${g.category}`" :data-testid="`trophy-category-${g.category}`">
        <h3 :id="`trophy-cat-${g.category}`" class="text-sm font-semibold text-muted">{{ t.categories[g.category] }}</h3>
        <ul class="grid gap-2 sm:grid-cols-2">
          <TrophyCard v-for="item in g.items" :key="item.id" :item="item" @open="openDetails" />
        </ul>
      </section>
      <p v-if="!earnedGroups.length" class="text-sm text-muted">{{ t.none }}</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="min-h-11 rounded-xl border border-line px-4"
        aria-controls="dash-trophy-list"
        :aria-expanded="showAll"
        data-testid="dash-trophies-more"
        @click="showAll = !showAll"
      >
        {{ showAll ? t.seeFewer : t.seeAll }}
      </button>
      <button type="button" class="min-h-11 rounded-xl border border-line px-4" data-testid="dash-trophies-locked" @click="lockedDialog?.showModal()">
        {{ t.seeLocked }}
      </button>
    </div>

    <dialog ref="lockedDialog" :class="dialogBox" :aria-label="t.lockedHeading" data-testid="locked-trophies">
      <div class="flex flex-col gap-6 p-5">
        <div class="flex flex-col gap-1 pr-10">
          <h2 class="text-lg font-semibold">{{ t.lockedHeading }}</h2>
          <p class="text-sm text-muted">{{ t.lockedHint }}</p>
        </div>
        <p v-if="!lockedGroups.length" class="text-sm text-muted">{{ t.lockedNone }}</p>
        <section v-for="g in lockedGroups" :key="g.category" class="flex flex-col gap-2" :aria-labelledby="`locked-cat-${g.category}`">
          <h3 :id="`locked-cat-${g.category}`" class="text-sm font-semibold text-muted">{{ t.categories[g.category] }}</h3>
          <ul class="grid gap-2 sm:grid-cols-2">
            <TrophyCard v-for="item in g.items" :key="item.id" :item="item" @open="openDetails" />
          </ul>
        </section>
        <button type="button" class="min-h-12 self-start rounded-xl border border-line px-4" @click="lockedDialog?.close()">{{ t.close }}</button>
      </div>
      <CloseX @click="lockedDialog?.close()" />
    </dialog>

    <!-- What I did to earn a trophy: each level reached and when, or the one thing for a single-step trophy. -->
    <dialog ref="detailsDialog" :class="dialogBox" :aria-label="details ? trophyName(details) : t.heading" data-testid="trophy-details">
      <div v-if="details" class="flex flex-col gap-6 p-5">
        <div class="flex items-center gap-3 pr-10">
          <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-done text-bg" aria-hidden="true"><AppIcon name="trophy" size="size-6" /></span>
          <div class="flex min-w-0 flex-col">
            <h2 class="text-lg font-semibold break-words">{{ trophyName(details) }}</h2>
            <span v-if="details.tier" class="text-sm">{{ t.tiers[details.tier] }}</span>
          </div>
        </div>
        <p data-testid="trophy-details-about">{{ detailsAbout }}</p>
        <ul v-if="details.thresholds.length > 1" class="flex flex-col gap-2" :aria-label="t.levelsHeading" data-testid="trophy-details-levels">
          <li v-for="(need, i) in details.thresholds" :key="need" class="flex items-baseline justify-between gap-3 text-sm" :class="i < details.level ? '' : 'text-muted'">
            <span>{{ t.tiers[TIERS[i]!] }} · {{ t.reached(need, details.unit) }}</span>
            <span class="shrink-0 text-xs text-muted">{{ details.days[i] ? dateWithYear(details.days[i]!) : i < details.level ? '' : t.notYet }}</span>
          </li>
        </ul>
        <p v-else-if="details.lastDay" class="text-sm text-muted">{{ t.earnedOn(dateWithYear(details.lastDay)) }}</p>
        <button type="button" class="min-h-12 self-start rounded-xl border border-line px-4" @click="detailsDialog?.close()">{{ t.close }}</button>
      </div>
      <CloseX @click="detailsDialog?.close()" />
    </dialog>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Trophies: the Dashboard's Trophies section: my 3 newest levels earned; See all trophies lists what I've
// earned or started by category, with progress; See locked trophies opens a window with the rest (surprises as ???).
// Tapping an earned trophy opens what I did to earn it.
import { computed, ref } from 'vue'
import { nextTick } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import CloseX from '@/components/CloseX.vue'
import TrophyCard from '@/trophies/components/TrophyCard.vue'
import { byCategory, newest, trophyName, type BoardItem } from '@/trophies/board'
import { TIERS } from '@/trophies/definitions'
import { messages } from '@/messages'
import { dateWithYear } from '@/ui/dates'
import { card, dialogBox } from '@/ui/styles'

const props = defineProps<{ items: BoardItem[] }>()
const cm = messages.celebrations
const t = cm.trophies

const detailsDialog = ref<HTMLDialogElement | null>(null)
const details = ref<BoardItem | null>(null)
async function openDetails(item: BoardItem) {
  details.value = item
  await nextTick()
  detailsDialog.value?.showModal()
}
/** What I did: a first time, a surprise found, or how the trophy is earned. */
const detailsAbout = computed(() => {
  const d = details.value
  if (!d) return ''
  if (d.category === 'firsts') return cm.badgesAbout[d.id] ?? ''
  return t.earnedAbout[d.id] ?? t.about[d.id] ?? ''
})

const showAll = ref(false)
const lockedDialog = ref<HTMLDialogElement | null>(null)
const earnedCount = computed(() => props.items.filter((i) => i.level).length)
const latest = computed(() => newest(props.items, 3))
const earnedGroups = computed(() => byCategory(props.items.filter((i) => !i.locked)))
const lockedGroups = computed(() => byCategory(props.items.filter((i) => i.locked)))
</script>
