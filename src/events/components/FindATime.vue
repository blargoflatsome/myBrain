<template>
  <div class="flex flex-col gap-3" data-testid="find-a-time">
    <p class="text-sm" role="status" data-testid="who-is-free">
      <template v-if="!brain.online">{{ m.offlineCheck }}</template>
      <template v-else-if="scheduling.loading.value">{{ m.checking }}</template>
      <template v-else-if="scheduling.slot.value && scheduling.checked.value">
        {{ m.summary(scheduling.freeCount.value, people.length) }}
        <span v-if="myStatus" class="block text-muted">{{ m.youAre[myStatus] }}</span>
      </template>
    </p>

    <button type="button" :class="[smallButton, 'self-start font-medium']" :disabled="!canFind" :aria-expanded="open" data-testid="find-a-time-button" @click="find">
      {{ m.findTime }}
    </button>

    <div v-if="open" class="flex flex-col gap-2">
      <h3 class="text-sm font-medium">{{ m.findTimeHeading }}</h3>
      <p v-if="!found.length" class="text-sm text-muted">{{ m.noTimes }}</p>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="s in found" :key="s.start">
          <button
            type="button"
            class="flex min-h-11 w-full flex-col items-start rounded-xl border border-line px-3 py-2 text-left text-sm [overflow-wrap:anywhere] hover:bg-bg"
            data-testid="suggested-time"
            :data-rating="s.rating"
            @click="pick(s)"
          >
            <span class="font-medium">{{ whenLabel(s) }}</span>
            <span class="text-muted">{{ m.rating[s.rating] }} · {{ whoLabel(s) }}</span>
          </button>
        </li>
      </ul>
      <p v-if="scheduling.unknownNames.value.length" class="text-xs text-muted">{{ m.unknownNote(scheduling.unknownNames.value.join(', ')) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// SPEC §10 Scheduler: who's free for the chosen time, and Find a time (up to 5 times, rated Good, Fair or Poor).
import { computed, ref } from 'vue'
import type { Suggestion } from '@/events/availability'
import type { SchedulingPerson, useScheduling } from '@/events/useScheduling'
import { todayIn } from '@/tasks/days'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import { smallButton } from '@/ui/styles'

const props = defineProps<{ scheduling: ReturnType<typeof useScheduling>; people: SchedulingPerson[] }>()
const emit = defineEmits<{ pick: [{ date: string; start: string; end: string }] }>()
const m = messages.invites
const brain = useBrainStore()

const myStatus = computed(() => {
  const s = props.scheduling.myStatus.value
  return s && s !== 'unknown' ? s : null
})
const canFind = computed(() => brain.online && !!props.scheduling.slot.value && props.scheduling.checked.value)
const open = ref(false)
const found = ref<Suggestion[]>([])
function find() {
  found.value = props.scheduling.suggest()
  open.value = true
}

const tz = props.scheduling.tz
const whenLabel = (s: Suggestion) =>
  new Date(s.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz })
const nameOf = (id: string) => (id === brain.userId ? m.you : (props.people.find((p) => p.id === id)?.name ?? ''))
const whoLabel = (s: Suggestion) => (s.cantMake.length ? m.allBut(s.cantMake.map(nameOf).join(', ')) : m.allFree)

function pick(s: Suggestion) {
  const fmt = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
  emit('pick', { date: todayIn(tz, new Date(s.start)), start: fmt(s.start), end: fmt(s.end) })
  open.value = false
}
</script>
