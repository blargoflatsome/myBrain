<template>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    :class="['inline-block shrink-0 align-[-0.15em]', size]"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :data-icon="name"
  >
    <path v-for="d in ICONS[name]" :key="d" :d="d" />
  </svg>
</template>

<script setup lang="ts">
// SPEC §2 Calm by design: a plain outline icon from the shared set. Always decorative (aria-hidden): the control or
// text next to it carries the meaning.
import { ICONS, type IconName } from '@/ui/icons'

withDefaults(defineProps<{ name: IconName; size?: string; filled?: boolean; strokeWidth?: number }>(), { size: 'size-[1.1em]', filled: false, strokeWidth: 2 })
</script>
