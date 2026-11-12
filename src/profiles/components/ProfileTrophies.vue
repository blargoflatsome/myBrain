<template>
  <section :class="card" aria-labelledby="profile-trophies" data-testid="profile-trophies">
    <h2 id="profile-trophies" class="text-lg font-semibold">{{ m.trophiesHeading }}</h2>
    <p v-if="!earned.length" class="text-sm text-muted">{{ m.noTrophies }}</p>
    <div v-else class="flex flex-col gap-6">
      <TrophyGroups :items="earned" id-prefix="profile-trophy-category" @open="details?.open($event)" />
    </div>
    <TrophyDetailsDialog ref="details" :theirs="theirs" />
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Profiles: someone's earned trophies, shown with the same cards and details window as my Dashboard's
// Trophies. Only levels and the days they were earned reach this device, so there's never progress to show.
import { computed, ref } from 'vue'
import TrophyGroups from '@/trophies/components/TrophyGroups.vue'
import TrophyDetailsDialog from '@/trophies/components/TrophyDetailsDialog.vue'
import { trophyBoard } from '@/trophies/board'
import { badgeRows, type ProfileBadge } from '@/profiles/rules'
import { deviceTimeZone } from '@/tasks/days'
import { messages } from '@/messages'
import { card } from '@/ui/styles'

const props = defineProps<{ badges: ProfileBadge[]; theirs: boolean }>()
const m = messages.personProfile
const details = ref<InstanceType<typeof TrophyDetailsDialog> | null>(null)
const earned = computed(() => trophyBoard(badgeRows(props.badges), null, deviceTimeZone()).filter((i) => i.level > 0))
</script>
