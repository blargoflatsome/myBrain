<template>
  <p>{{ time.hm }} <span class="tv-ampm">{{ time.ampm }}</span></p>
</template>

<script setup lang="ts">
// SPEC §9 TV app: the TV's clocks (the dashboard's and the night screen's) are always 12-hour, with "am" or "pm" in
// small letters after the time (2026-11-26, user), whatever the TV's own time setting.
import { computed } from 'vue'
import { clockIn } from '@/time/days'
import { formatTime } from '@/time/parse'

const props = defineProps<{ now: Date; timeZone: string }>()
const time = computed(() => {
  const [hm, ampm] = formatTime(clockIn(props.now.getTime(), props.timeZone), true).split(' ')
  return { hm, ampm }
})
</script>
