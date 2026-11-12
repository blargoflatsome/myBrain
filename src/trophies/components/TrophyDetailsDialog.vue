<template>
  <!-- What earned a trophy: each level reached and when, or the one thing for a single-step trophy. -->
  <dialog ref="dialog" :class="dialogBox" :aria-label="details ? trophyName(details) : t.heading" data-testid="trophy-details">
    <div v-if="details" class="flex flex-col gap-6 p-5">
      <div class="flex items-center gap-3 pr-10">
        <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-done text-bg" aria-hidden="true"><AppIcon name="trophy" size="size-6" /></span>
        <div class="flex min-w-0 flex-col">
          <h2 class="text-lg font-semibold break-words">{{ trophyName(details) }}</h2>
          <span v-if="details.tier" class="text-sm">{{ t.tiers[details.tier] }}</span>
        </div>
      </div>
      <p v-if="about" data-testid="trophy-details-about">{{ about }}</p>
      <ul v-if="details.thresholds.length > 1" class="flex flex-col gap-2" :aria-label="t.levelsHeading" data-testid="trophy-details-levels">
        <li v-for="(need, i) in details.thresholds" :key="need" class="flex items-baseline justify-between gap-3 text-sm" :class="i < details.level ? '' : 'text-muted'">
          <span>{{ t.tiers[TIERS[i]!] }} · {{ t.reached(need, details.unit) }}</span>
          <span class="shrink-0 text-xs text-muted">{{ details.days[i] ? dateWithYear(details.days[i]!) : i < details.level ? '' : t.notYet }}</span>
        </li>
      </ul>
      <p v-else-if="details.lastDay" class="text-sm text-muted">{{ t.earnedOn(dateWithYear(details.lastDay)) }}</p>
      <button type="button" class="self-start" :class="secondaryButton" @click="dialog?.close()">{{ t.close }}</button>
    </div>
    <CloseX @click="dialog?.close()" />
  </dialog>
</template>

<script setup lang="ts">
// SPEC §5 Trophies, Profiles: the window an earned trophy opens, the same on my Dashboard and on a connection's
// profile. Mine says what I did ("You kept…"); someone else's says how it's earned instead.
import { computed, nextTick, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import CloseX from '@/components/CloseX.vue'
import { trophyName, type BoardItem } from '@/trophies/board'
import { TIERS } from '@/trophies/definitions'
import { messages } from '@/messages'
import { dateWithYear } from '@/ui/dates'
import { dialogBox, secondaryButton } from '@/ui/styles'

const props = defineProps<{ theirs?: boolean }>()
const cm = messages.celebrations
const t = cm.trophies
const dialog = ref<HTMLDialogElement | null>(null)
const details = ref<BoardItem | null>(null)

const about = computed(() => {
  const d = details.value
  if (!d) return ''
  if (d.category === 'firsts') return props.theirs ? '' : (cm.badgesAbout[d.id] ?? '')
  return props.theirs ? (t.about[d.id] ?? '') : (t.earnedAbout[d.id] ?? t.about[d.id] ?? '')
})

defineExpose({
  open: async (item: BoardItem) => {
    details.value = item
    await nextTick()
    dialog.value?.showModal()
  },
})
</script>
