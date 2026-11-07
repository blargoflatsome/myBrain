<script setup lang="ts">
// SPEC §5 Journal: the day's stats, shown visually so they can be read at a glance.
import { computed } from 'vue'
import type { JournalStats } from '@/sync/types'
import { percent } from '@/routines/rules'
import { messages } from '@/messages'

const props = defineProps<{ stats: JournalStats }>()
const m = messages.journal

const R = 26
const C = 2 * Math.PI * R
const rings = computed(() => [
  { key: 'tasks', label: m.tasks, done: props.stats.tasks.done, total: props.stats.tasks.due },
  { key: 'habits', label: m.habits, done: props.stats.habits.kept, total: props.stats.habits.scheduled },
])
const dash = (done: number, total: number) => `${total ? (done / total) * C : 0} ${C}`
</script>

<template>
  <section class="flex flex-col gap-4" :aria-label="m.statsLabel" data-testid="journal-stats">
    <div class="grid grid-cols-2 gap-3">
      <div v-for="r in rings" :key="r.key" class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3" :data-testid="`stat-${r.key}`">
        <svg viewBox="0 0 64 64" class="size-16 shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" :r="R" fill="none" stroke="currentColor" stroke-width="7" class="text-line" />
          <circle
            v-if="r.done > 0"
            cx="32"
            cy="32"
            :r="R"
            fill="none"
            stroke="currentColor"
            stroke-width="7"
            stroke-linecap="round"
            class="text-accent"
            :stroke-dasharray="dash(r.done, r.total)"
          />
        </svg>
        <div class="min-w-0">
          <div class="text-sm text-muted">{{ r.label }}</div>
          <div class="text-xl font-semibold" data-testid="stat-value">{{ r.total ? m.ofTotal(r.done, r.total) : '–' }}</div>
        </div>
      </div>
    </div>

    <div v-if="stats.routines.length" class="flex flex-col gap-2" data-testid="stat-routines">
      <div class="text-sm text-muted">{{ m.routines }}</div>
      <div v-for="r in stats.routines" :key="r.id" class="flex items-center gap-3">
        <span class="w-28 shrink-0 truncate text-sm">{{ r.title }}</span>
        <div
          class="h-3 flex-1 overflow-hidden rounded-full bg-line"
          role="meter"
          :aria-label="r.title"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="percent(r.done, r.total)"
        >
          <div class="h-full rounded-full bg-accent" :style="{ width: `${percent(r.done, r.total)}%` }" />
        </div>
        <span class="w-10 text-right text-sm tabular-nums">{{ percent(r.done, r.total) }}%</span>
      </div>
    </div>

    <div v-if="stats.priority.length" class="flex flex-wrap items-center gap-2" data-testid="stat-priority">
      <span class="text-sm text-muted">{{ m.priority }}</span>
      <span
        v-for="p in stats.priority"
        :key="p.title"
        class="flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
        :class="p.done ? 'border-accent text-ink' : 'border-line text-muted'"
        :aria-label="p.done ? m.priorityDone(p.title) : m.priorityNotDone(p.title)"
      ><span aria-hidden="true">{{ p.done ? '✓' : '○' }}</span>{{ p.title }}</span>
    </div>

    <div v-if="stats.streaks.length" class="flex flex-wrap items-center gap-2" data-testid="stat-streaks">
      <span class="text-sm text-muted">{{ m.streaks }}</span>
      <span
        v-for="s in stats.streaks"
        :key="s.title"
        class="rounded-full px-3 py-1 text-sm"
        :class="s.kind === 'reached' ? 'bg-accent text-accent-ink' : 'border border-line text-muted'"
      >{{ s.kind === 'reached' ? `🔥 ${m.reached(s.title, s.days)}` : m.reset(s.title) }}</span>
    </div>

    <div v-if="stats.quests.length" class="flex flex-wrap items-center gap-2" data-testid="stat-quests">
      <span class="text-sm text-muted">{{ m.quests }} · {{ stats.quests.length }}</span>
      <span v-for="q in stats.quests" :key="q" class="rounded-full border border-line px-3 py-1 text-sm">★ {{ q }}</span>
    </div>
  </section>
</template>
